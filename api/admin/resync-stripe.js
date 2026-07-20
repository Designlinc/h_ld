// api/admin/resync-stripe.js — re-fetch the real subscription state from
// Stripe and overwrite whatever's currently stored. A safety valve for
// the rare case a webhook delivery is missed and the database quietly
// drifts from what Stripe actually thinks is happening.
import sql from '../../lib/db.js';
import { requireSuperAdmin } from '../../lib/auth.js';
import { requireStripe } from '../../lib/stripe.js';

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const auth = requireSuperAdmin(req, res);
  if (!auth) return;

  const stripe = requireStripe(res);
  if (!stripe) return;

  const { organizationId } = req.body || {};
  if (!organizationId) return res.status(400).json({ error: 'organizationId required' });

  const [org] = await sql`SELECT id, stripe_subscription_id FROM organizations WHERE id = ${organizationId}`;
  if (!org) return res.status(404).json({ error: 'Organization not found' });
  if (!org.stripe_subscription_id) {
    return res.status(400).json({ error: 'This organization has no Stripe subscription to resync' });
  }

  let subscription;
  try {
    subscription = await stripe.subscriptions.retrieve(org.stripe_subscription_id);
  } catch (err) {
    return res.status(502).json({ error: 'Could not reach Stripe: ' + err.message });
  }

  // Mirrors the same mapping the webhook itself uses — only a genuinely
  // gone subscription flips billing_status; anything else (active,
  // past_due, trialing) just updates the informational stripe_status
  // field without touching access.
  const billingStatus = ['canceled', 'incomplete_expired'].includes(subscription.status) ? 'cancelled' : 'active';

  await sql`
    UPDATE organizations SET stripe_status = ${subscription.status}, billing_status = ${billingStatus}
    WHERE id = ${organizationId}
  `;

  return res.json({ ok: true, stripeStatus: subscription.status, billingStatus });
}
