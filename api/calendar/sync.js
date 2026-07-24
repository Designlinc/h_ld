// api/calendar/sync.js — push a booking to Google Calendar
import sql from '../../lib/db.js';
import { requireAuth } from '../../lib/auth.js';
import { requireOrg } from '../../lib/tenant.js';
import { getValidGoogleToken } from '../../lib/googleCalendar.js';

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') return res.status(200).end();

  const org = await requireOrg(req, res);
  if (!org) return;
  const auth = requireAuth(req, res, org);
  if (!auth) return;

  if (req.method === 'DELETE') {
    // Removes a Google Calendar event directly by ID — used when a booking
    // is cancelled. Takes eventId/practitionerId directly rather than a
    // bookingId lookup because by the time this runs the booking row may
    // already be gone (cancelling removes the booking from the bookings
    // table entirely, not just marks it cancelled).
    const { eventId, practitionerId } = req.body || {};
    if (!eventId) return res.status(400).json({ error: 'Missing eventId' });
    try {
      const accessToken = await getValidGoogleToken(practitionerId || auth.practitioner_id);
      const gcRes = await fetch(`https://www.googleapis.com/calendar/v3/calendars/primary/events/${eventId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      // 410 Gone means it was already deleted (e.g. removed manually in
      // Google Calendar) — treat that the same as a successful delete
      // rather than surfacing it as an error.
      if (!gcRes.ok && gcRes.status !== 404 && gcRes.status !== 410) {
        const errText = await gcRes.text().catch(() => '');
        throw new Error(`Google Calendar delete failed (${gcRes.status}): ${errText}`);
      }
      return res.json({ ok: true });
    } catch (err) {
      console.error('Calendar delete error:', err);
      return res.status(500).json({ error: err.message });
    }
  }

  if (req.method !== 'POST') return res.status(405).end();

  const { bookingId } = req.body;
  // Scoped by organization_id — this was previously a bare lookup by ID
  // with no tenant check at all.
  const [b] = await sql`SELECT * FROM bookings WHERE id = ${bookingId} AND organization_id = ${org.id}`;
  if (!b) return res.status(404).json({ error: 'Booking not found' });

  try {
    // Sync to whichever practitioner actually owns the booking, not
    // necessarily whoever is currently logged in — matters once an org
    // has more than one staff member, each with their own calendar.
    // Falls back to the calling practitioner for org-wide/legacy bookings
    // with no practitioner assigned.
    const accessToken = await getValidGoogleToken(b.practitioner_id || auth.practitioner_id);

    const paymentUrl = `https://${org.subdomain}.h-ld.com/pay.html?payment=${b.id}`;

    // Normalise date — Postgres DATE comes back as a Date object or ISO string
    const dateStr = typeof b.date === 'string'
      ? b.date.slice(0, 10)
      : `${b.date.getUTCFullYear()}-${String(b.date.getUTCMonth()+1).padStart(2,'0')}-${String(b.date.getUTCDate()).padStart(2,'0')}`;

    // Normalise time — handle plain "HH:MM", with-seconds "HH:MM:SS",
    // or JSON-encoded "\"HH:MM\"" from Postgres
    let rawTime = b.time || '09:00';
    if (typeof rawTime === 'string' && rawTime.startsWith('"')) rawTime = JSON.parse(rawTime);
    const timeStr = rawTime.slice(0, 5);

    // Build start/end datetime
    const startDt = new Date(`${dateStr}T${timeStr}:00`);
    if (isNaN(startDt.getTime())) throw new Error(`Invalid date/time: ${dateStr} ${timeStr}`);
    const endDt = new Date(startDt.getTime() + (b.duration || 60) * 60000);
    const fmtDt = (dt) => {
      const y = dt.getFullYear(), mo = String(dt.getMonth()+1).padStart(2,'0'), day = String(dt.getDate()).padStart(2,'0');
      const h = String(dt.getHours()).padStart(2,'0'), m = String(dt.getMinutes()).padStart(2,'0');
      return `${y}-${mo}-${day}T${h}:${m}:00`;
    };

    const event = {
      summary: `${b.service_name} — ${b.client_name}`,
      description: `Client: ${b.client_name}\nService: ${b.service_name}\nDuration: ${b.duration} min\nPrice: $${b.price}\n\n💳 Take payment:\n${paymentUrl}`,
      start: { dateTime: fmtDt(startDt), timeZone: 'Australia/Sydney' },
      end:   { dateTime: fmtDt(endDt),   timeZone: 'Australia/Sydney' },
    };

    let gcRes;
    if (b.google_event_id) {
      gcRes = await fetch(`https://www.googleapis.com/calendar/v3/calendars/primary/events/${b.google_event_id}`, {
        method: 'PUT',
        headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(event),
      });
    } else {
      gcRes = await fetch('https://www.googleapis.com/calendar/v3/calendars/primary/events', {
        method: 'POST',
        headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(event),
      });
    }

    const gcData = await gcRes.json();
    if (gcData.id) {
      // Still scoped by organization_id on the write, even though we
      // already confirmed ownership above — cheap extra guarantee against
      // this ever updating the wrong row.
      await sql`UPDATE bookings SET google_event_id = ${gcData.id} WHERE id = ${b.id} AND organization_id = ${org.id}`;
    }

    return res.json({ ok: true, eventId: gcData.id });
  } catch (err) {
    console.error('Calendar sync error:', err);
    return res.status(500).json({ error: err.message });
  }
}
