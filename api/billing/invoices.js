// api/billing/invoices.js — invoice history + payment method, for native
// in-app display. The portal (portal.js) still handles actually updating
// the card — that's a materially bigger build to replace (Stripe Elements
// + SetupIntent + 3D Secure handling), so it stays a portal redirect for
// now while everything read-only moves in-app.
import sql from '../../lib/db.js';
import { requireAuth } from '../../lib/auth.js';
import { requireOrg } from '../../lib/tenant.js';
import { requireStripe } from '../../lib/stripe.js';
import { getBillingHistory } from '../../lib/billingHistory.js';

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const org = await requireOrg(req, res);
  if (!org) return;
  const auth = requireAuth(req, res, org);
  if (!auth) return;

  const stripe = requireStripe(res);
  if (!stripe) return;

  const [orgRow] = await sql`SELECT stripe_customer_id FROM organizations WHERE id = ${org.id}`;
  const result = await getBillingHistory(stripe, orgRow.stripe_customer_id);
  return res.json(result);
}
