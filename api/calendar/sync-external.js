// api/calendar/sync-external.js — on-demand refresh of the cached external
// (native-calendar) events for the CALLING practitioner's own connection,
// for the "Sync now" button in Settings > Connected Accounts. This is the
// inbound half of that button (native calendar → h_ld's cache); the
// existing api/calendar/sync-all.js is the outbound half (h_ld bookings →
// native calendar) — the admin.html button calls both together.
//
// Deliberately a separate, authenticated route from the cron job that
// does the same underlying work platform-wide (api/cron/sync-external-
// calendars.js) — that route is gated by CRON_SECRET, a platform-level
// secret that must never be reachable from the browser. This route is
// gated by the practitioner's own login instead, and is hard-scoped to
// their own practitioner_id, so it can only ever refresh their own data.
import sql from '../../lib/db.js';
import { requireAuth } from '../../lib/auth.js';
import { requireOrg } from '../../lib/tenant.js';
import { syncExternalCalendarForPractitioner } from '../../lib/calendarSync.js';

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).end();

  const org = await requireOrg(req, res);
  if (!org) return;
  const auth = requireAuth(req, res, org);
  if (!auth) return;

  const { provider } = req.body || {};
  if (!provider || !['google', 'microsoft'].includes(provider)) {
    return res.status(400).json({ error: 'A valid provider (google or microsoft) is required' });
  }

  const [connection] = await sql`
    SELECT 1 FROM oauth_tokens WHERE practitioner_id = ${auth.practitioner_id} AND provider = ${provider}
  `;
  if (!connection) {
    return res.status(400).json({ error: `${provider === 'google' ? 'Google' : 'Microsoft'} Calendar is not connected` });
  }

  try {
    const count = await syncExternalCalendarForPractitioner(auth.practitioner_id, provider);
    return res.json({ ok: true, count });
  } catch (err) {
    console.error(`[sync-external] Failed for practitioner ${auth.practitioner_id} (${provider}):`, err);
    return res.status(500).json({ error: err.message || 'Could not refresh external calendar events' });
  }
}
