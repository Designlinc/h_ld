// api/push/index.js — combined push endpoint
// GET  → returns VAPID public key
// POST → save a push subscription
//
// This used to also handle a `?action=payment` branch that sent a Square
// payment deep-link push notification — removed entirely rather than
// fixed, since it was confirmed unreachable from anywhere in the current
// app, pointed to a callback page that no longer exists, hardcoded
// "Solful Kinesiology" into every payment note regardless of whose
// business it actually was, and — more seriously — queried
// push_subscriptions with no organization filtering at all, meaning it
// would have notified every practitioner across every org on the
// platform if it were ever accidentally triggered or reintroduced. Square
// payments now go through the proper OAuth-connected payment link flow
// built elsewhere in the app instead.
import sql from '../../lib/db.js';

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') return res.status(200).end();

  // ── GET: return VAPID public key ──
  if (req.method === 'GET') {
    return res.json({ publicKey: process.env.VAPID_PUBLIC_KEY });
  }

  if (req.method !== 'POST') return res.status(405).end();

  // ── Save a push subscription ──
  const { subscription, deviceName } = req.body;
  if (!subscription?.endpoint) return res.status(400).json({ error: 'Invalid subscription' });

  await sql`
    INSERT INTO push_subscriptions (endpoint, subscription, device_name)
    VALUES (${subscription.endpoint}, ${JSON.stringify(subscription)}, ${deviceName || 'Unknown device'})
    ON CONFLICT (endpoint) DO UPDATE SET
      subscription = EXCLUDED.subscription,
      device_name  = EXCLUDED.device_name
  `;
  return res.json({ ok: true });
}
