// api/invoices/[id]/sync-xero.js — manually (re)sync a specific invoice to
// Xero. The automatic sync in lib/invoices.js only ever runs once, at the
// moment the invoice is first created — if it fails (expired connection,
// missing account config, anything), there's nothing that automatically
// tries again. This is that retry, triggered from the Invoices page
// instead of needing to recreate the whole booking just to get another
// attempt.
import sql from '../../../lib/db.js';
import { requireAuth } from '../../../lib/auth.js';
import { requireOrg } from '../../../lib/tenant.js';
import { syncInvoiceToXero } from '../../../lib/xero.js';

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const org = await requireOrg(req, res);
  if (!org) return;
  const auth = requireAuth(req, res, org);
  if (!auth) return;

  const { id } = req.query;
  const [invoice] = await sql`SELECT * FROM invoices WHERE id = ${id} AND organization_id = ${org.id}`;
  if (!invoice) return res.status(404).json({ error: 'Invoice not found' });

  // Invoices don't store practitioner_id directly (yet — every invoice
  // today comes from a booking, so this join covers it); the practitioner
  // who owns the connected Xero account is whoever owns the booking this
  // invoice was generated from.
  let practitionerId = auth.practitioner_id;
  if (invoice.booking_id) {
    const [booking] = await sql`SELECT practitioner_id FROM bookings WHERE id = ${invoice.booking_id}`;
    if (booking?.practitioner_id) practitionerId = booking.practitioner_id;
  }

  try {
    const force = !!(req.body && req.body.force);
    const result = await syncInvoiceToXero(invoice, practitionerId, { force });
    if (!result) {
      return res.status(400).json({ error: 'Xero is not connected — connect it in Settings first' });
    }
    return res.json({ ok: true, xeroInvoiceId: result.xeroInvoiceId });
  } catch (err) {
    console.error('Manual Xero sync failed for invoice', id, err);
    return res.status(500).json({ error: err.message });
  }
}
