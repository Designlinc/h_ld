// api/payments/create-link.js — Create a Square payment link and send it via SMS
import { randomUUID } from 'crypto';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const { bookingId, amount, phone, description } = req.body || {};

  if (!bookingId || !amount) {
    return res.status(400).json({ error: 'bookingId and amount are required' });
  }
  if (!phone) {
    return res.status(400).json({ error: 'No phone number on file for this client' });
  }

  try {
    // 1. Create the Square-hosted payment link
    const squareRes = await fetch('https://connect.squareup.com/v2/online-checkout/payment-links', {
      method: 'POST',
      headers: {
        'Square-Version': '2026-05-20',
        'Authorization': `Bearer ${process.env.SQUARE_ACCESS_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        idempotency_key: randomUUID(),
        quick_pay: {
          name: description || 'Solful Kinesiology Session',
          price_money: {
            amount: Math.round(amount * 100), // cents
            currency: 'AUD',
          },
          location_id: process.env.SQUARE_LOCATION_ID,
        },
        // Square copies this note onto the resulting Payment object —
        // this is the SAME "booking:xxx" format your webhook already parses,
        // so no changes are needed to api/webhooks/square.js
        payment_note: `booking:${bookingId}`,
        checkout_options: {
          redirect_url: `${process.env.NEXT_PUBLIC_APP_URL}/solful-thanks.html?payment=${bookingId}`,
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
    // NOTE: env var names / request shape below are a best guess based on
    // ClickSend's standard SMS API — swap this block for your existing
    // sendSms() helper if Solful already has one, so credentials/formatting
    // stay consistent with the rest of the app.
    const smsRes = await fetch('https://rest.clicksend.com/v3/sms/send', {
      method: 'POST',
      headers: {
        Authorization:
          'Basic ' +
          Buffer.from(`${process.env.CLICKSEND_USERNAME}:${process.env.CLICKSEND_API_KEY}`).toString('base64'),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        messages: [
          {
            to: phone,
            body: `Hi! Here's your secure payment link for your Solful Kinesiology session: ${paymentUrl}`,
            from: process.env.CLICKSEND_SENDER || 'Solful',
            source: 'solful-booking',
          },
        ],
      }),
    });

    const smsData = await smsRes.json();
    const smsOk = smsRes.ok && smsData?.response_code === 'SUCCESS';

    if (!smsOk) {
      console.error('ClickSend SMS error:', smsData);
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
