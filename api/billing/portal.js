// api/billing/portal.js — redirects to Stripe's hosted Billing Portal for
// payment method management and invoice history/downloads. Requires an
// existing Stripe customer (i.e. checkout has already happened once).
import sql from '../../lib/db.js';
import { requireAuth } from '../../lib/auth.js';
import { requireOrg } from '../../lib/tenant.js';
import { requireStripe } from '../../lib/stripe.js';

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const org = await requireOrg(req, res);
  if (!org) return;
  const auth = requireAuth(req, res, org);
  if (!auth) return;

  const stripe = requireStripe(res);
  if (!stripe) return;

  const [orgRow] = await sql`SELECT stripe_customer_id FROM organizations WHERE id = ${org.id}`;
  if (!orgRow.stripe_customer_id) {
    return res.status(400).json({ error: 'No billing account yet — start a subscription first' });
  }

  const session = await stripe.billingPortal.sessions.create({
    customer: orgRow.stripe_customer_id,
    return_url: `https://${org.subdomain}.h-ld.com/`,
  });

  return res.json({ url: session.url });
}
