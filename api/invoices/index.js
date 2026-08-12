// api/invoices/index.js — GET list of invoices for the authenticated org.
import sql from '../../lib/db.js';
import { requireAuth } from '../../lib/auth.js';
import { requireOrg } from '../../lib/tenant.js';

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const org = await requireOrg(req, res);
  if (!org) return;
  const auth = requireAuth(req, res, org);
  if (!auth) return;

  const rows = await sql`
    SELECT id, invoice_number, status, client_name, client_email, total,
           gst_registered, payment_method, paid_at, issued_at, xero_invoice_id
    FROM invoices
    WHERE organization_id = ${org.id}
    ORDER BY issued_at DESC
  `;
  return res.json(rows);
}
