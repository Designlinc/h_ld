// lib/invoices.js — generates an invoice the moment a booking's payment is
// confirmed, from either trigger point: the Square webhook (online payment)
// or a manually recorded payment (api/bookings/index.js's bulk sync).
//
// Deliberately always creates the invoice already marked 'paid' — nothing
// in this app currently supports billing before payment, so there's no
// "unpaid/awaiting" invoice state to model yet. If that changes later
// (e.g. deposits, payment plans), this is the file that needs the new
// status logic, not the callers.
import sql from './db.js';
import { randomUUID } from 'crypto';

const SANS = "-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif";

// Assigns the next sequential invoice number for this org, atomically —
// UPDATE ... RETURNING under Postgres's own row-level locking means two
// invoices generated in the same instant still can't collide or skip a
// number, which matters since gaps/duplicates make these unusable as real
// accounting records.
async function nextInvoiceNumber(orgId, prefix) {
  const [row] = await sql`
    UPDATE organizations
    SET invoice_number_counter = invoice_number_counter + 1
    WHERE id = ${orgId}
    RETURNING invoice_number_counter
  `;
  const n = row.invoice_number_counter;
  return `${prefix}${String(n).padStart(4, '0')}`;
}

// GST math: prices in this app are GST-inclusive (what the client actually
// paid), matching how they're already shown throughout the booking flow —
// so GST is backed out of the total, not added on top. Standard ATO
// approach for a GST-inclusive amount: GST = total / 11.
function computeGst(total, gstRegistered) {
  if (!gstRegistered) return { subtotal: total, gstAmount: 0 };
  const gstAmount = Math.round((total / 11) * 100) / 100;
  const subtotal = Math.round((total - gstAmount) * 100) / 100;
  return { subtotal, gstAmount };
}

export async function generateInvoiceForBooking(bookingId, orgId) {
  const [booking] = await sql`SELECT * FROM bookings WHERE id = ${bookingId} AND organization_id = ${orgId}`;
  if (!booking || !booking.paid_at) return null;

  // One invoice per booking — if this booking somehow triggers the
  // generation path twice (e.g. a webhook retry), don't create a duplicate.
  const [existing] = await sql`SELECT id FROM invoices WHERE booking_id = ${bookingId} AND organization_id = ${orgId}`;
  if (existing) return null;

  const [settingsRow] = await sql`SELECT value FROM settings WHERE organization_id = ${orgId} AND key = 'app_settings'`;
  const settings = settingsRow?.value || {};
  const [org] = await sql`SELECT name FROM organizations WHERE id = ${orgId}`;

  const bizName = settings.bizName || org?.name || 'Your Business';
  const total = Number(booking.payment_amount ?? booking.price ?? 0);
  const gstRegistered = !!settings.gstRegistered;
  const { subtotal, gstAmount } = computeGst(total, gstRegistered);

  const prefix = settings.invoicePrefix || 'INV-';
  const invoiceNumber = await nextInvoiceNumber(orgId, prefix);

  const lineItems = [{
    description: booking.service_name || 'Appointment',
    date: booking.date,
    quantity: 1,
    unitPrice: total,
    amount: total,
  }];

  const id = randomUUID();
  const [invoice] = await sql`
    INSERT INTO invoices (
      id, organization_id, booking_id, invoice_number, status,
      client_name, client_email, biz_name, biz_address, abn, gst_registered,
      line_items, subtotal, gst_amount, total, payment_method, paid_at
    ) VALUES (
      ${id}, ${orgId}, ${bookingId}, ${invoiceNumber}, 'paid',
      ${booking.client_name}, ${booking.client_email}, ${bizName}, ${settings.address || null},
      ${settings.abn || null}, ${gstRegistered},
      ${JSON.stringify(lineItems)}, ${subtotal}, ${gstAmount}, ${total},
      ${booking.payment_method || null}, ${booking.paid_at}
    )
    RETURNING *
  `;

  // Awaited, not fired in the background, for the same reason the callers
  // of this function now await it too — Vercel can tear down the execution
  // environment the moment the caller's response goes out, which would
  // silently cut this off mid-send otherwise. A failed send still shouldn't
  // undo an already-created invoice record, so it's caught locally.
  try {
    await sendInvoiceEmail(invoice, settings);
  } catch (err) {
    console.error('Invoice email failed:', err);
  }

  return invoice;
}

// The actual printable invoice document — used both embedded in the email
// and as the standalone page a client lands on if they click "View invoice".
// Kept intentionally plain and print-friendly rather than trying to match
// the decorative booking-confirmation emails; this is a document people
// need to be able to save as a PDF via their browser's print dialog, or
// forward to a bookkeeper, not a marketing artifact.
export function renderInvoiceHtml(invoice) {
  const lineItems = typeof invoice.line_items === 'string' ? JSON.parse(invoice.line_items) : invoice.line_items;
  const dateStr = new Date(invoice.issued_at).toLocaleDateString('en-AU', { day: 'numeric', month: 'long', year: 'numeric' });
  const fmt = n => '$' + Number(n).toFixed(2);

  const rows = lineItems.map(li => `
    <tr>
      <td style="padding:10px 0;border-bottom:1px solid #E5E1DE">${li.description}${li.date ? ' — ' + new Date(li.date).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' }) : ''}</td>
      <td style="padding:10px 0;border-bottom:1px solid #E5E1DE;text-align:right;white-space:nowrap">${fmt(li.amount)}</td>
    </tr>
  `).join('');

  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Invoice ${invoice.invoice_number}</title></head>
<body style="font-family:${SANS};background:#fff;color:#1A1A1A;margin:0;padding:40px 20px">
<div style="max-width:600px;margin:0 auto">
  <table role="presentation" width="100%" style="margin-bottom:32px">
    <tr>
      <td>
        <div style="font-size:22px;font-weight:700">${invoice.biz_name}</div>
        ${invoice.biz_address ? `<div style="font-size:13px;color:#666;margin-top:4px">${invoice.biz_address}</div>` : ''}
        ${invoice.abn ? `<div style="font-size:13px;color:#666;margin-top:2px">ABN ${invoice.abn}</div>` : ''}
      </td>
      <td style="text-align:right;vertical-align:top">
        <div style="font-size:20px;font-weight:700">${invoice.gst_registered ? 'Tax Invoice' : 'Invoice'}</div>
        <div style="font-size:13px;color:#666;margin-top:4px">${invoice.invoice_number}</div>
        <div style="font-size:13px;color:#666">${dateStr}</div>
      </td>
    </tr>
  </table>

  <div style="font-size:12px;color:#888;text-transform:uppercase;letter-spacing:.4px;margin-bottom:6px">Billed to</div>
  <div style="font-size:15px;font-weight:600;margin-bottom:24px">${invoice.client_name}${invoice.client_email ? `<br><span style="font-weight:400;color:#666;font-size:13px">${invoice.client_email}</span>` : ''}</div>

  <table role="presentation" width="100%" style="border-collapse:collapse;font-size:14px">
    <thead>
      <tr>
        <th style="text-align:left;padding-bottom:8px;border-bottom:2px solid #1A1A1A;font-size:12px;text-transform:uppercase;letter-spacing:.4px;color:#888">Description</th>
        <th style="text-align:right;padding-bottom:8px;border-bottom:2px solid #1A1A1A;font-size:12px;text-transform:uppercase;letter-spacing:.4px;color:#888">Amount</th>
      </tr>
    </thead>
    <tbody>${rows}</tbody>
  </table>

  <table role="presentation" width="100%" style="margin-top:16px;font-size:14px">
    ${invoice.gst_registered ? `
    <tr><td style="padding:4px 0;text-align:right;color:#666">Subtotal</td><td style="padding:4px 0;text-align:right;width:100px">${fmt(invoice.subtotal)}</td></tr>
    <tr><td style="padding:4px 0;text-align:right;color:#666">GST</td><td style="padding:4px 0;text-align:right">${fmt(invoice.gst_amount)}</td></tr>
    ` : ''}
    <tr><td style="padding:10px 0 4px;text-align:right;font-weight:700;font-size:16px;border-top:1px solid #E5E1DE">Total paid</td><td style="padding:10px 0 4px;text-align:right;font-weight:700;font-size:16px;border-top:1px solid #E5E1DE">${fmt(invoice.total)}</td></tr>
  </table>

  <div style="margin-top:32px;padding-top:16px;border-top:1px solid #E5E1DE;font-size:12px;color:#888">
    Paid ${invoice.payment_method ? 'via ' + invoice.payment_method + ' ' : ''}on ${new Date(invoice.paid_at).toLocaleDateString('en-AU', { day: 'numeric', month: 'long', year: 'numeric' })}.
  </div>
</div>
</body></html>`;
}

// Sender/reply-to logic matches api/bookings/index.js and
// api/notifications/send.js — shows the practitioner's business name via
// h_ld's verified sending domain, replies go to the practitioner directly.
async function sendInvoiceEmail(invoice, settings) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey || !invoice.client_email) return;

  const senderName = settings.bizName || invoice.biz_name;
  const from = settings.emailFrom || `${senderName} <bookings@h-ld.com>`;
  const replyTo = settings.email || undefined;
  const html = renderInvoiceHtml(invoice);

  await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      from,
      to: invoice.client_email,
      subject: `${invoice.gst_registered ? 'Tax invoice' : 'Invoice'} ${invoice.invoice_number} from ${senderName}`,
      html,
      reply_to: replyTo,
    }),
  });
}
