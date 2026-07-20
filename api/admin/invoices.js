// api/admin/invoices.js — billing history for any organization, for the
// super-admin org detail view. Same underlying helper as the
// practitioner-facing api/billing/invoices.js — deliberately, so the two
// can never show different numbers for the same org.
import sql from '../../lib/db.js';
import { requireSuperAdmin } from '../../lib/auth.js';
import { requireStripe } from '../../lib/stripe.js';
import { getBillingHistory } from '../../lib/billingHistory.js';

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const auth = requireSuperAdmin(req, res);
  if (!auth) return;

  const stripe = requireStripe(res);
  if (!stripe) return;

  const { organizationId } = req.query;
  if (!organizationId) return res.status(400).json({ error: 'organizationId required' });

  const [orgRow] = await sql`SELECT stripe_customer_id FROM organizations WHERE id = ${organizationId}`;
  if (!orgRow) return res.status(404).json({ error: 'Organization not found' });

  const result = await getBillingHistory(stripe, orgRow.stripe_customer_id);
  return res.json(result);
}
