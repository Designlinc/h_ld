// api/payments/lookup-subdomain.js — given a booking ID, returns which
// organization's subdomain it belongs to. Exists specifically for
// square-callback.html: Square's Point of Sale API requires one exact,
// pre-registered callback URL per application, with no wildcard support
// (confirmed directly against the Square Developer Portal) — which is
// fundamentally incompatible with a multi-tenant app where every
// practitioner has their own subdomain. This endpoint is what lets a
// single, fixed root-domain callback URL figure out which practitioner's
// pay.html to actually send the browser back to.
//
// Deliberately returns nothing except the subdomain — no client details,
// amounts, or anything else — since this has no authentication of its
// own. Booking IDs are unguessable UUIDs, so exposing "this ID belongs to
// this subdomain" isn't a meaningful information leak on its own.
import sql from '../../lib/db.js';

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).end();

  const { bookingId } = req.query;
  if (!bookingId) return res.status(400).json({ error: 'Missing bookingId' });

  const [row] = await sql`
    SELECT o.subdomain
    FROM bookings b
    JOIN organizations o ON o.id = b.organization_id
    WHERE b.id = ${bookingId}
  `;

  if (!row) return res.status(404).json({ error: 'Booking not found' });
  return res.json({ subdomain: row.subdomain });
}
