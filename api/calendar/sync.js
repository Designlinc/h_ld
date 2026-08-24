// api/calendar/sync.js — push a booking to whichever calendar provider(s)
// a practitioner has connected. A practitioner can have both Google and
// Microsoft connected at once — bookings sync to every connected
// provider, not just one preferred one, since connecting a calendar
// implies wanting bookings to actually show up there.
import sql from '../../lib/db.js';
import { requireAuth } from '../../lib/auth.js';
import { requireOrg } from '../../lib/tenant.js';
import { getValidGoogleToken } from '../../lib/googleCalendar.js';
import { getValidMicrosoftToken } from '../../lib/microsoftCalendar.js';

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') return res.status(200).end();

  const org = await requireOrg(req, res);
  if (!org) return;
  const auth = requireAuth(req, res, org);
  if (!auth) return;

  if (req.method === 'DELETE') {
    // Removes a calendar event directly by ID — used when a booking is
    // cancelled. Takes eventId/practitionerId/provider directly rather
    // than a bookingId lookup because by the time this runs the booking
    // row may already be gone. provider defaults to google for backward
    // compatibility with any existing call sites that predate Microsoft
    // support and only ever pass eventId/practitionerId.
    const { eventId, practitionerId, provider = 'google' } = req.body || {};
    if (!eventId) return res.status(400).json({ error: 'Missing eventId' });
    try {
      const pid = practitionerId || auth.practitioner_id;
      if (provider === 'microsoft') {
        const accessToken = await getValidMicrosoftToken(pid);
        const msRes = await fetch(`https://graph.microsoft.com/v1.0/me/events/${eventId}`, {
          method: 'DELETE',
          headers: { Authorization: `Bearer ${accessToken}` },
        });
        // 404 means it was already deleted (e.g. removed manually in
        // Outlook) — treat that the same as a successful delete.
        if (!msRes.ok && msRes.status !== 404) {
          const errText = await msRes.text().catch(() => '');
          throw new Error(`Microsoft Calendar delete failed (${msRes.status}): ${errText}`);
        }
      } else {
        const accessToken = await getValidGoogleToken(pid);
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

  // Sync to whichever practitioner actually owns the booking, not
  // necessarily whoever is currently logged in — matters once an org has
  // more than one staff member, each with their own calendar. Falls back
  // to the calling practitioner for org-wide/legacy bookings with no
  // practitioner assigned.
  const practitionerId = b.practitioner_id || auth.practitioner_id;

  const connectedProviders = await sql`
    SELECT provider FROM oauth_tokens WHERE practitioner_id = ${practitionerId} AND provider IN ('google', 'microsoft')
  `;
  if (!connectedProviders.length) {
    return res.status(400).json({ error: 'No calendar is connected for this practitioner' });
  }

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
  if (isNaN(startDt.getTime())) return res.status(400).json({ error: `Invalid date/time: ${dateStr} ${timeStr}` });
  const endDt = new Date(startDt.getTime() + (b.duration || 60) * 60000);
  const fmtDt = (dt) => {
    const y = dt.getFullYear(), mo = String(dt.getMonth()+1).padStart(2,'0'), day = String(dt.getDate()).padStart(2,'0');
    const h = String(dt.getHours()).padStart(2,'0'), m = String(dt.getMinutes()).padStart(2,'0');
    return `${y}-${mo}-${day}T${h}:${m}:00`;
  };

  const description = `Client: ${b.client_name}\nService: ${b.service_name}\nDuration: ${b.duration} min\nPrice: $${b.price}\n\n💳 Take payment:\n${paymentUrl}`;
  const results = {};

  for (const { provider } of connectedProviders) {
    try {
      if (provider === 'google') {
        const accessToken = await getValidGoogleToken(practitionerId);
        const event = {
          summary: `${b.service_name} — ${b.client_name}`,
          description,
          start: { dateTime: fmtDt(startDt), timeZone: 'Australia/Sydney' },
          end:   { dateTime: fmtDt(endDt),   timeZone: 'Australia/Sydney' },
        };
        const gcRes = b.google_event_id
          ? await fetch(`https://www.googleapis.com/calendar/v3/calendars/primary/events/${b.google_event_id}`, {
              method: 'PUT', headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' }, body: JSON.stringify(event),
            })
          : await fetch('https://www.googleapis.com/calendar/v3/calendars/primary/events', {
              method: 'POST', headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' }, body: JSON.stringify(event),
            });
        const gcData = await gcRes.json();
        if (gcData.id) {
          await sql`UPDATE bookings SET google_event_id = ${gcData.id} WHERE id = ${b.id} AND organization_id = ${org.id}`;
          results.google = { ok: true, eventId: gcData.id };
        } else {
          results.google = { ok: false, error: gcData.error?.message || 'Unknown error' };
        }
      } else if (provider === 'microsoft') {
        const accessToken = await getValidMicrosoftToken(practitionerId);
        // Microsoft Graph's event shape differs from Google's — subject
        // instead of summary, body.content instead of a bare description
        // string — but represents the same underlying event.
        const event = {
          subject: `${b.service_name} — ${b.client_name}`,
          body: { contentType: 'Text', content: description },
          start: { dateTime: fmtDt(startDt), timeZone: 'Australia/Sydney' },
          end:   { dateTime: fmtDt(endDt),   timeZone: 'Australia/Sydney' },
        };
        const msRes = b.microsoft_event_id
          ? await fetch(`https://graph.microsoft.com/v1.0/me/events/${b.microsoft_event_id}`, {
              method: 'PATCH', headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' }, body: JSON.stringify(event),
            })
          : await fetch('https://graph.microsoft.com/v1.0/me/events', {
              method: 'POST', headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' }, body: JSON.stringify(event),
            });
        const msData = await msRes.json();
        if (msData.id) {
          await sql`UPDATE bookings SET microsoft_event_id = ${msData.id} WHERE id = ${b.id} AND organization_id = ${org.id}`;
          results.microsoft = { ok: true, eventId: msData.id };
        } else {
          results.microsoft = { ok: false, error: msData.error?.message || 'Unknown error' };
        }
      }
    } catch (err) {
      console.error(`Calendar sync error (${provider}):`, err);
      results[provider] = { ok: false, error: err.message };
    }
  }

  // Overall success if at least one connected provider synced —
  // partial failure (one provider down, another fine) shouldn't block
  // the booking flow, but each provider's own result is still reported.
  const anyOk = Object.values(results).some(r => r.ok);
  return res.status(anyOk ? 200 : 500).json({ ok: anyOk, results });
}
