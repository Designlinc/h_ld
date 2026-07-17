// api/billing/cancel.js — cancels the org's subscription immediately.
// Restricted to the 'owner' role — in the future multi-practitioner case,
// a staff member shouldn't be able to cancel the whole organization's
// subscription out from under everyone else.
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
  if (auth.role !== 'owner') {
    return res.status(403).json({ error: 'Only the account owner can cancel the subscription' });
  }

  const stripe = requireStripe(res);
  if (!stripe) return;

  const [orgRow] = await sql`SELECT stripe_subscription_id FROM organizations WHERE id = ${org.id}`;
  if (!orgRow.stripe_subscription_id) {
    return res.status(400).json({ error: 'No active subscription to cancel' });
  }

  await stripe.subscriptions.cancel(orgRow.stripe_subscription_id);

  // Update immediately for responsive UI — the webhook will also fire and
  // set the same state, so this is a fast-path, not the only path.
  await sql`UPDATE organizations SET billing_status = 'cancelled' WHERE id = ${org.id}`;

  return res.json({ ok: true });
}
