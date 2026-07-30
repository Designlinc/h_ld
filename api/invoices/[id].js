// api/invoices/[id].js — renders the printable invoice document as HTML.
// Public on purpose — reached via the "View invoice" link in the invoice
// email itself, same security model already used for the intake form and
// the .ics calendar file: the ID is an unguessable UUID, and this only
// ever returns data that was already sent to that specific client.
import sql from '../../lib/db.js';
import { requireOrg } from '../../lib/tenant.js';
import { renderInvoiceHtml } from '../../lib/invoices.js';

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const org = await requireOrg(req, res);
  if (!org) return;

  const { id } = req.query;
  const [invoice] = await sql`SELECT * FROM invoices WHERE id = ${id} AND organization_id = ${org.id}`;
  if (!invoice) return res.status(404).send('Invoice not found');

  const html = renderInvoiceHtml(invoice);
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  return res.status(200).send(html);
}
