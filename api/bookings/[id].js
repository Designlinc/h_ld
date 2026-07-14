// api/bookings/[id].js - GET single, PUT update, DELETE single
import sql from '../../lib/db.js';
import { requireAuth } from '../../lib/auth.js';
import { requireOrg } from '../../lib/tenant.js';

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') return res.status(200).end();

  const org = await requireOrg(req, res);
  if (!org) return;

  const { id } = req.query;
  if (!id) return res.status(400).json({ error: 'Missing booking id' });

  // GET is public - used by solful-pay.html (no auth needed). Still scoped
  // to this org — a booking ID guessed or leaked from a different org's
  // subdomain won't resolve here, since the WHERE clause requires both.
  if (req.method === 'GET') {
    try {
      const rows = await sql`
        SELECT * FROM bookings WHERE id::text = ${id} AND organization_id = ${org.id}
      `;
      const row = rows[0];
      if (!row) return res.status(404).json({ error: 'Booking not found' });

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
        WHERE id::text = ${id} AND organization_id = ${org.id}
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

      // Confirm this booking actually belongs to the org before taking
      // payment against it.
      const [booking] = await sql`SELECT id FROM bookings WHERE id::text = ${id} AND organization_id = ${org.id}`;
      if (!booking) return res.status(404).json({ error: 'Booking not found' });

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
      // Intentionally public (no login) so the payment page can mark a
      // booking paid without an admin session — but scoped to this org,
      // and still limited to payment fields only, never client PII or
      // appointment details. Full-record edits go through the
      // authenticated bulk sync endpoint used by the admin app.
      await sql`
        UPDATE bookings SET
          status             = ${b.status || null},
          payment_method     = ${b.paymentMethod  ?? b.payment_method  ?? null},
          payment_amount     = ${b.paymentAmount  ?? b.payment_amount  ?? null},
          paid_at            = ${b.paidAt         ?? b.paid_at         ?? null},
          updated_at         = NOW()
        WHERE id::text = ${id} AND organization_id = ${org.id}
      `;
      return res.json({ ok: true });
    } catch(err) {
      console.error('[id].js PUT error:', err.message);
      return res.status(500).json({ error: err.message });
    }
  }

  // DELETE requires auth — nothing in the app calls this without a login.
  if (!requireAuth(req, res, org)) return;

  if (req.method === 'DELETE') {
    await sql`DELETE FROM bookings WHERE id::text = ${id} AND organization_id = ${org.id}`;
    return res.json({ ok: true });
  }

  res.status(405).json({ error: 'Method not allowed' });
}
