// api/bookings/[id].js - GET single, PUT update, DELETE single
import sql from '../../lib/db.js';
import { requireAuth } from '../../lib/auth.js';

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') return res.status(200).end();

  const { id } = req.query;
  if (!id) return res.status(400).json({ error: 'Missing booking id' });

  // GET is public - used by solful-pay.html (no auth needed)
  if (req.method === 'GET') {
    try {
      const rows = await sql`
        SELECT * FROM bookings WHERE id::text = ${id}
      `;
      const row = rows[0];
      if (!row) return res.status(404).json({ error: 'Booking not found' });

      // Normalise column names to match frontend expectations
      return res.json({
        id:             row.id,
        client:         row.client_name,
        email:          row.client_email,
        phone:          row.client_phone,
        service:        row.service_name,
        serviceId:      row.service_id,
        duration:       row.duration,
        price:          row.price,
        date:           row.date,
        time:           row.time,
        location:       row.location,
        notes:          row.notes,
        status:         row.status,
        paymentMethod:  row.payment_method,
        paymentAmount:  row.payment_amount,
        paidAt:         row.paid_at,
        intakeSubmitted:  row.intake_submitted,
        intakeResponses:  row.intake_responses,
        googleEventId:  row.google_event_id,
      });
    } catch(err) {
      console.error('[id].js GET error:', err.message);
      return res.status(500).json({ error: err.message });
    }
  }

  // POST - public, used by intake form to submit responses and deposit checkout
  if (req.method === 'POST') {
    const { action } = req.query;
    if (action === 'intake') {
      const { responses } = req.body;
      await sql`
        UPDATE bookings SET
          intake_submitted   = true,
          intake_responses   = ${JSON.stringify(responses || {})},
          updated_at         = NOW()
        WHERE id::text = ${id}
      `;
      return res.json({ ok: true });
    }

    if (action === 'checkout') {
      // Create Square Online Checkout for deposit payment
      const { amount, description, redirectUrl } = req.body;
      const squareToken = process.env.SQUARE_ACCESS_TOKEN;
      const squareEnv = process.env.SQUARE_ENV || 'production';
      const baseUrl = squareEnv === 'sandbox'
        ? 'https://connect.squareupsandbox.com'
        : 'https://connect.squareup.com';

      if (!squareToken) return res.status(500).json({ error: 'Square not configured' });

      try {
        const amountCents = Math.round(parseFloat(amount) * 100);
        const response = await fetch(`${baseUrl}/v2/online-checkout/payment-links`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${squareToken}`,
            'Square-Version': '2026-05-20',
          },
          body: JSON.stringify({
            idempotency_key: id + '-deposit-' + Date.now(),
            quick_pay: {
              name: description || 'Booking Deposit',
              price_money: { amount: amountCents, currency: 'AUD' },
              location_id: process.env.SQUARE_LOCATION_ID,
            },
            // Square copies this onto the resulting Payment object — this is
            // what api/webhooks/square.js matches against to find the booking.
            // Without it, a paid deposit will succeed on Square's side but
            // never update this booking's status.
            payment_note: `booking:${id}`,
            checkout_options: {
              redirect_url: redirectUrl,
            },
          }),
        });
        const data = await response.json();
        if (!response.ok) {
          console.error('Square checkout error:', JSON.stringify(data));
          return res.status(500).json({ error: data.errors?.[0]?.detail || 'Square checkout failed' });
        }
        return res.json({ checkoutUrl: data.payment_link?.url, linkId: data.payment_link?.id });
      } catch (err) {
        return res.status(500).json({ error: err.message });
      }
    }

    return res.status(400).json({ error: 'Unknown action' });
  }

  if (req.method === 'PUT') {
    try {
      const b = req.body;
      // This endpoint is intentionally public (no login) so the payment
      // page can mark a booking paid without an admin session. To limit
      // what a guessed/leaked booking ID could be used for, it may ONLY
      // touch payment-related fields — never client PII or appointment
      // details. Full-record edits go through the authenticated bulk
      // sync endpoint (PUT /api/bookings) used by the admin app.
      await sql`
        UPDATE bookings SET
          status             = ${b.status || null},
          payment_method     = ${b.paymentMethod  ?? b.payment_method  ?? null},
          payment_amount     = ${b.paymentAmount  ?? b.payment_amount  ?? null},
          paid_at            = ${b.paidAt         ?? b.paid_at         ?? null},
          updated_at         = NOW()
        WHERE id::text = ${id}
      `;
      return res.json({ ok: true });
    } catch(err) {
      console.error('[id].js PUT error:', err.message);
      return res.status(500).json({ error: err.message });
    }
  }

  // DELETE requires admin auth — nothing in the app calls this without
  // a login, so there's no legitimate reason for it to be public.
  if (!requireAuth(req, res)) return;

  if (req.method === 'DELETE') {
    await sql`DELETE FROM bookings WHERE id::text = ${id}`;
    return res.json({ ok: true });
  }

  res.status(405).json({ error: 'Method not allowed' });
}
