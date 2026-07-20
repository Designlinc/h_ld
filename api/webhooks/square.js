// api/webhooks/square.js — Square payment.updated webhook
import sql from '../../lib/db.js';
import crypto from 'crypto';

// Square signs the exact raw bytes it sent. Body parsing is disabled below
// so we can verify against the untouched raw body — see api/webhooks/stripe.js
// for the same reasoning, applied there too.
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

  // One Square Application (yours), one webhook signing key — this stays
  // global even though tokens are now per-practitioner, because Square's
  // webhook model delivers events for every merchant connected to your
  // app through this single signed endpoint, distinguished by merchant_id
  // in the payload rather than by a per-merchant signature.
  const signature = req.headers['x-square-hmacsha256-signature'];
  const expected = crypto
    .createHmac('sha256', process.env.SQUARE_WEBHOOK_SIGNATURE_KEY)
    .update('https://h-ld.com/api/webhooks/square' + rawBody)
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
    const match = note.match(/booking:([a-z0-9-]+)/i);
    if (match) {
      const bookingId = match[1];
      const merchantId = data.object.payment.merchant_id || payload.merchant_id;

      const [booking] = await sql`SELECT id, organization_id, practitioner_id FROM bookings WHERE id = ${bookingId}`;
      if (!booking) {
        console.warn('Square webhook: booking not found for id', bookingId);
        return res.status(200).json({ ok: true });
      }

      // Confirm this payment actually belongs to the practitioner this
      // booking is for — a booking ID is already a hard-to-guess UUID, so
      // this is defense-in-depth rather than the only thing standing
      // between tenants, but it closes the gap cheaply.
      const [tokenRow] = await sql`
        SELECT metadata FROM oauth_tokens
        WHERE practitioner_id = ${booking.practitioner_id} AND provider = 'square'
      `;
      const expectedMerchantId = tokenRow?.metadata?.merchantId;
      if (expectedMerchantId && merchantId && expectedMerchantId !== merchantId) {
        console.error('Square webhook: merchant_id mismatch for booking', bookingId);
        return res.status(200).json({ ok: true }); // acknowledge, don't apply
      }

      await sql`
        UPDATE bookings SET
          status         = 'completed',
          payment_method = 'square',
          payment_amount = ${data.object.payment.amount_money.amount / 100},
          paid_at        = NOW(),
          updated_at     = NOW()
        WHERE id = ${bookingId} AND organization_id = ${booking.organization_id}
      `;
    }
  }

  res.status(200).json({ ok: true });
}

export const config = { api: { bodyParser: false } };
