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
import { syncBookingToProvider } from '../../lib/calendarSync.js';

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

  const results = {};
  for (const { provider } of connectedProviders) {
    results[provider] = await syncBookingToProvider(b, provider, practitionerId, org);
  }

  // Overall success if at least one connected provider synced —
  // partial failure (one provider down, another fine) shouldn't block
  // the booking flow, but each provider's own result is still reported.
  const anyOk = Object.values(results).some(r => r.ok);
  return res.status(anyOk ? 200 : 500).json({ ok: anyOk, results });
}
