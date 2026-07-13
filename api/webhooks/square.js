// api/webhooks/square.js — Square payment.updated webhook
import sql from '../../lib/db.js';
import crypto from 'crypto';

// Square signs the exact raw bytes it sent. Vercel's default body parser
// re-serializes the parsed JSON, which can differ from the original bytes
// (key order, spacing, number formatting) and cause valid signatures to
// fail verification. Body parsing is disabled below so we can read and
// verify against the untouched raw body.
function getRawBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (chunk) => { data += chunk; });
    req.on('end', () => resolve(data));
    req.on('error', reject);
  });
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const rawBody = await getRawBody(req);

  // Verify Square webhook signature against the raw bytes
  const signature = req.headers['x-square-hmacsha256-signature'];
  const expected = crypto
    .createHmac('sha256', process.env.SQUARE_WEBHOOK_SIGNATURE_KEY)
    .update(process.env.NEXT_PUBLIC_APP_URL + '/api/webhooks/square' + rawBody)
    .digest('base64');

  if (signature !== expected) {
    return res.status(401).json({ error: 'Invalid signature' });
  }

  let payload;
  try {
    payload = JSON.parse(rawBody);
  } catch (err) {
    console.error('Webhook body was not valid JSON:', err.message);
    return res.status(400).json({ error: 'Invalid JSON body' });
  }

  const { type, data } = payload;
  if (type === 'payment.updated' && data?.object?.payment?.status === 'COMPLETED') {
    const note = data?.object?.payment?.note || '';
    const match = note.match(/booking:([a-z0-9]+)/i);
    if (match) {
      const bookingId = match[1];
      await sql`
        UPDATE bookings SET
          status         = 'completed',
          payment_method = 'square',
          payment_amount = ${data.object.payment.amount_money.amount / 100},
          paid_at        = NOW(),
          updated_at     = NOW()
        WHERE id = ${bookingId}
      `;
    }
  }

  res.status(200).json({ ok: true });
}

export const config = { api: { bodyParser: false } };
