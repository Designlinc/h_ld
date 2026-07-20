// api/payments/create-link.js — Create a Square payment link and send it via SMS
import { randomUUID } from 'crypto';
import sql from '../../lib/db.js';
import { requireAuth } from '../../lib/auth.js';
import { requireOrg } from '../../lib/tenant.js';
import { getValidSquareToken } from '../../lib/square.js';

const SQUARE_ENV = process.env.SQUARE_ENV || 'production';
const SQUARE_BASE_URL = SQUARE_ENV === 'sandbox'
  ? 'https://connect.squareupsandbox.com'
  : 'https://connect.squareup.com';

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') return res.status(200).end();

  // This previously had no auth check and no org scoping at all — anyone
  // who found the endpoint could generate a payment link against
  // whichever SQUARE_ACCESS_TOKEN happened to be configured globally.
  const org = await requireOrg(req, res);
  if (!org) return;
  const auth = requireAuth(req, res, org);
  if (!auth) return;
  if (req.method !== 'POST') return res.status(405).end();

  const { bookingId, amount, phone, description } = req.body || {};

  if (!bookingId || !amount) {
    return res.status(400).json({ error: 'bookingId and amount are required' });
  }
  if (!phone) {
    return res.status(400).json({ error: 'No phone number on file for this client' });
  }

  const [booking] = await sql`SELECT id, practitioner_id FROM bookings WHERE id = ${bookingId} AND organization_id = ${org.id}`;
  if (!booking) return res.status(404).json({ error: 'Booking not found' });

  let square;
  try {
    square = await getValidSquareToken(booking.practitioner_id || auth.practitioner_id);
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }

  const [settingsRow] = await sql`SELECT value FROM settings WHERE organization_id = ${org.id} AND key = 'app_settings'`;
  const orgSettings = settingsRow?.value || {};

  try {
    // 1. Create the Square-hosted payment link
    const squareRes = await fetch(`${SQUARE_BASE_URL}/v2/online-checkout/payment-links`, {
      method: 'POST',
      headers: {
        'Square-Version': '2026-05-20',
        'Authorization': `Bearer ${square.accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        idempotency_key: randomUUID(),
        quick_pay: {
          name: description || `${orgSettings.bizName || org.name} Session`,
          price_money: {
            amount: Math.round(amount * 100), // cents
            currency: 'AUD',
          },
          location_id: square.locationId,
        },
        // Square copies this note onto the resulting Payment object — the
        // webhook matches on this same "booking:xxx" format.
        payment_note: `booking:${bookingId}`,
        checkout_options: {
          redirect_url: `https://${org.subdomain}.h-ld.com/thanks.html?payment=${bookingId}`,
        },
      }),
    });

    const squareData = await squareRes.json();

    if (!squareRes.ok) {
      console.error('Square create-payment-link error:', squareData);
      return res.status(502).json({ error: 'Square API error', details: squareData });
    }

    const paymentUrl = squareData.payment_link.url;

    // 2. Text the link to the client via ClickSend
    const username = process.env.CLICKSEND_USERNAME;
    const apiKey = process.env.CLICKSEND_API_KEY;
    let smsOk = false;
    let smsData = null;

    if (username && apiKey) {
      const smsRes = await fetch('https://rest.clicksend.com/v3/sms/send', {
        method: 'POST',
        headers: {
          Authorization: 'Basic ' + Buffer.from(`${username}:${apiKey}`).toString('base64'),
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          messages: [{
            to: phone,
            body: `Hi! Here's your secure payment link for your ${orgSettings.bizName || org.name} session: ${paymentUrl}`,
            from: orgSettings.clickSendSender || org.name,
            source: 'h_ld',
          }],
        }),
      });
      smsData = await smsRes.json();
      smsOk = smsRes.ok && smsData?.response_code === 'SUCCESS';
    }

    if (!smsOk) {
      if (smsData) console.error('ClickSend SMS error:', smsData);
      // Link exists and is valid even if the SMS failed — return it so the
      // admin can copy/share it manually rather than losing the link.
      return res.status(200).json({
        url: paymentUrl,
        smsSent: false,
        warning: 'Payment link created but SMS failed to send.',
      });
    }

    return res.status(200).json({ url: paymentUrl, smsSent: true });
  } catch (err) {
    console.error('create-link handler error:', err);
    return res.status(500).json({ error: 'Failed to create payment link' });
  }
}
