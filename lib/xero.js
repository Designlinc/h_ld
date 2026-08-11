// lib/xero.js — get a valid Xero access token for a practitioner,
// refreshing it first if expired. Same shape as lib/googleCalendar.js's
// getValidGoogleToken, so anything already familiar with that pattern
// reads this one for free.
import sql from './db.js';

export async function getValidXeroToken(practitionerId) {
  const [token] = await sql`
    SELECT * FROM oauth_tokens WHERE practitioner_id = ${practitionerId} AND provider = 'xero'
  `;
  if (!token) return null; // not connected — callers treat this as "skip Xero sync", not an error

  const metadata = token.metadata || {};

  if (new Date(token.expires_at) > new Date(Date.now() + 60000)) {
    return { accessToken: token.access_token, tenantId: metadata.tenantId, defaultBankAccountId: metadata.defaultBankAccountId };
  }

  const res = await fetch('https://identity.xero.com/connect/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Authorization: 'Basic ' + Buffer.from(`${process.env.XERO_CLIENT_ID}:${process.env.XERO_CLIENT_SECRET}`).toString('base64'),
    },
    body: new URLSearchParams({ refresh_token: token.refresh_token, grant_type: 'refresh_token' }),
  });
  const data = await res.json();
  if (!data.access_token) {
    throw new Error('Xero connection has expired — please reconnect it in Settings');
  }

  await sql`
    UPDATE oauth_tokens SET
      access_token  = ${data.access_token},
      refresh_token = ${data.refresh_token || token.refresh_token},
      expires_at    = ${new Date(Date.now() + data.expires_in * 1000).toISOString()},
      updated_at    = NOW()
    WHERE practitioner_id = ${practitionerId} AND provider = 'xero'
  `;

  return { accessToken: data.access_token, tenantId: metadata.tenantId, defaultBankAccountId: metadata.defaultBankAccountId };
}

// Finds an existing Xero contact by email (preferred) or name, or creates
// one — mirrors how a practitioner would normally work in Xero itself,
// where the same client showing up under two different contact records
// would be a real annoyance to clean up later.
async function findOrCreateXeroContact(accessToken, tenantId, invoice) {
  const headers = { Authorization: `Bearer ${accessToken}`, 'Xero-tenant-id': tenantId, Accept: 'application/json' };

  if (invoice.client_email) {
    const searchRes = await fetch(`https://api.xero.com/api.xro/2.0/Contacts?where=${encodeURIComponent(`EmailAddress=="${invoice.client_email}"`)}`, { headers });
    const searchData = await searchRes.json();
    if (searchData.Contacts?.[0]) return searchData.Contacts[0].ContactID;
  }

  const createRes = await fetch('https://api.xero.com/api.xro/2.0/Contacts', {
    method: 'POST',
    headers: { ...headers, 'Content-Type': 'application/json' },
    body: JSON.stringify({ Contacts: [{ Name: invoice.client_name, EmailAddress: invoice.client_email || undefined }] }),
  });
  const createData = await createRes.json();
  const contact = createData.Contacts?.[0];
  if (!contact) throw new Error('Xero: could not create contact — ' + JSON.stringify(createData.Elements?.[0]?.ValidationErrors || createData));
  return contact.ContactID;
}

// Pushes an already-paid h_ld invoice into the practitioner's connected
// Xero account, as an already-paid invoice there too — creates the invoice
// (Status: AUTHORISED, required before a payment can be applied), then
// records a payment against it for the full amount. Two API calls, not
// one — Xero has no single "create this already paid" shortcut the way
// some other platforms do.
//
// Silently does nothing (no error) if Xero isn't connected for this
// practitioner — this is treated as an optional enhancement on top of the
// invoice that's already been created and emailed, never something that
// should be able to block or fail that core flow.
export async function syncInvoiceToXero(invoice, practitionerId) {
  const xero = await getValidXeroToken(practitionerId);
  if (!xero) return null;
  if (!xero.defaultBankAccountId) {
    throw new Error('No bank account configured for Xero — reconnect Xero in Settings to fix this');
  }

  const headers = { Authorization: `Bearer ${xero.accessToken}`, 'Xero-tenant-id': xero.tenantId, Accept: 'application/json', 'Content-Type': 'application/json' };
  const contactId = await findOrCreateXeroContact(xero.accessToken, xero.tenantId, invoice);

  const lineItems = typeof invoice.line_items === 'string' ? JSON.parse(invoice.line_items) : invoice.line_items;
  const issueDate = new Date(invoice.issued_at).toISOString().slice(0, 10);

  const invoiceRes = await fetch('https://api.xero.com/api.xro/2.0/Invoices', {
    method: 'POST',
    headers,
    body: JSON.stringify({
      Invoices: [{
        Type: 'ACCREC',
        Contact: { ContactID: contactId },
        Date: issueDate,
        DueDate: issueDate,
        Status: 'AUTHORISED',
        Reference: invoice.invoice_number,
        LineItems: lineItems.map(li => ({
          Description: li.description,
          Quantity: li.quantity || 1,
          UnitAmount: li.unitPrice,
          // Xero's own GST rate types — matches whether this invoice was
          // GST-registered at the time it was issued, same snapshot the
          // h_ld invoice itself already uses rather than a live settings
          // lookup, so this can never disagree with the invoice it's
          // supposed to be a copy of.
          TaxType: invoice.gst_registered ? 'OUTPUT' : 'NONE',
        })),
      }],
    }),
  });
  const invoiceData = await invoiceRes.json();
  const xeroInvoice = invoiceData.Invoices?.[0];
  if (!xeroInvoice?.InvoiceID) {
    throw new Error('Xero: could not create invoice — ' + JSON.stringify(invoiceData.Elements?.[0]?.ValidationErrors || invoiceData));
  }

  const paymentRes = await fetch('https://api.xero.com/api.xro/2.0/Payments', {
    method: 'POST',
    headers,
    body: JSON.stringify({
      Payments: [{
        Invoice: { InvoiceID: xeroInvoice.InvoiceID },
        Account: { AccountID: xero.defaultBankAccountId },
        Date: new Date(invoice.paid_at).toISOString().slice(0, 10),
        Amount: invoice.total,
      }],
    }),
  });
  const paymentData = await paymentRes.json();
  if (!paymentData.Payments?.[0]?.PaymentID) {
    throw new Error('Xero: invoice created but payment failed — ' + JSON.stringify(paymentData.Elements?.[0]?.ValidationErrors || paymentData));
  }

  return { xeroInvoiceId: xeroInvoice.InvoiceID };
}
