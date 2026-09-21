// api/cron/sync-external-calendars.js — periodic refresh of the
// external_calendar_events cache (2-way calendar sync), for EVERY
// practitioner across every organization.
//
// The actual fetch/upsert/delete-stale logic lives in
// syncExternalCalendarForPractitioner (lib/calendarSync.js), shared with
// the on-demand "Sync now" button in Settings > Connected Accounts (see
// api/calendar/sync-external.js) — this file just loops over every
// connected practitioner/provider pair platform-wide and calls it.
//
// This cache is what the public availability list and the admin calendar
// display read from — it is NOT the authoritative check at booking time
// (see hasCalendarConflict in lib/calendarSync.js for that), so a stale
// cache can only ever cause a slightly-too-permissive availability list
// between refreshes, never a bad write to the bookings table itself.
//
// Triggered by Vercel Cron (see vercel.json) via a GET request carrying
// `Authorization: Bearer $CRON_SECRET`, which Vercel sends automatically
// for scheduled invocations. Also safe to hit manually with that same
// header for a full platform-wide refresh or troubleshooting — the
// practitioner-facing "Sync now" button deliberately does NOT call this
// route, since CRON_SECRET is a platform-level secret that must never
// reach the browser; it calls api/calendar/sync-external.js instead,
// which does the same work scoped to just the requesting practitioner.
import sql from '../../lib/db.js';
import { syncExternalCalendarForPractitioner } from '../../lib/calendarSync.js';

export default async function handler(req, res) {
  const auth = req.headers.authorization || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : null;
  if (!process.env.CRON_SECRET || token !== process.env.CRON_SECRET) {
    return res.status(401).json({ error: 'Unauthorised' });
  }

  const connections = await sql`
    SELECT practitioner_id, provider FROM oauth_tokens WHERE provider IN ('google', 'microsoft')
  `;

  const results = [];
  for (const { practitioner_id: practitionerId, provider } of connections) {
    try {
      const count = await syncExternalCalendarForPractitioner(practitionerId, provider);
      results.push({ practitionerId, provider, ok: true, count });
    } catch (err) {
      // One practitioner's expired token or a transient provider error must
      // never abort the run for everyone else — collected and reported
      // instead of thrown.
      console.error(`[sync-external-calendars] Failed for practitioner ${practitionerId} (${provider}):`, err.message);
      results.push({ practitionerId, provider, ok: false, error: err.message });
    }
  }

  return res.status(200).json({ ok: true, synced: results.length, results });
}
