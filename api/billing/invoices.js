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

  try {
    const [orgRow] = await sql`SELECT stripe_customer_id FROM organizations WHERE id = ${org.id}`;
    const result = await getBillingHistory(stripe, orgRow.stripe_customer_id);
    return res.json(result);
  } catch (err) {
    // Covers both a database hiccup on the query above (the same transient
    // Neon connection issue already found elsewhere in this app) and a
    // Stripe-side failure (most likely stripe_customer_id no longer being
    // valid — a deleted test customer, a placeholder from manual testing,
    // etc). Either way, this guarantees a real error message comes back
    // instead of the function crashing with no response at all, which is
    // what was producing the generic "Request failed".
    console.error('Billing history lookup failed for org', org.id, err);
    return res.status(500).json({ error: err.message || 'Could not load billing history' });
  }
}
