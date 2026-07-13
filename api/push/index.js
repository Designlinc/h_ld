// api/push/index.js — combined push endpoint
// GET             → returns VAPID public key
// POST            → save a push subscription
// POST ?action=payment → send Square payment push notification (requires auth)
import sql from '../../lib/db.js';
import { requireAuth } from '../../lib/auth.js';
import webpush from 'web-push';
 
export default async function handler(req, res) {
  if (req.method === 'OPTIONS') return res.status(200).end();
 
  // ── GET: return VAPID public key ──
  if (req.method === 'GET') {
    return res.json({ publicKey: process.env.VAPID_PUBLIC_KEY });
  }
 
  if (req.method !== 'POST') return res.status(405).end();
 
  const action = req.query.action;
 
  // ── Send Square payment push notification ──
  if (action === 'payment') {
    if (!requireAuth(req, res)) return;
 
    if (!process.env.VAPID_PUBLIC_KEY || !process.env.VAPID_PRIVATE_KEY) {
      return res.status(503).json({ error: 'Push notifications not configured yet' });
    }
 
    webpush.setVapidDetails(
      process.env.VAPID_MAILTO || 'mailto:admin@example.com',
      process.env.VAPID_PUBLIC_KEY,
      process.env.VAPID_PRIVATE_KEY
    );
 
    const { bookingId } = req.body;
    const [b] = await sql`SELECT * FROM bookings WHERE id = ${bookingId}`;
    if (!b) return res.status(404).json({ error: 'Booking not found' });
 
    const cents = Math.round((b.payment_amount || b.price) * 100);
    const squareData = JSON.stringify({
      amount_money:  { amount: cents, currency_code: 'AUD' },
      callback_url:  `${process.env.NEXT_PUBLIC_APP_URL}/solful-pay.html?payment=${b.id}`,
      client_id:     process.env.SQUARE_APP_ID,
      version:       '1.3',
      notes:         `Solful Kinesiology — ${b.service_name}`,
      options:       { supported_tender_types: ['CREDIT_CARD', 'CASH', 'OTHER'] },
    });
    const squareUrl = `square-commerce-v1://payment/create?data=${encodeURIComponent(squareData)}`;
 
    const payload = JSON.stringify({
      title:  `Take payment — $${b.price}`,
      body:   `${b.client_name} · ${b.service_name}`,
      url:    squareUrl,
      icon:   '/icon-192.png',
    });
 
    const subs = await sql`SELECT * FROM push_subscriptions`;
    const results = await Promise.allSettled(
      subs.map(s => webpush.sendNotification(JSON.parse(s.subscription), payload))
    );
 
    const sent = results.filter(r => r.status === 'fulfilled').length;
    return res.json({ ok: true, sent, total: subs.length });
  }
 
  // ── Default: save a push subscription ──
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
 
