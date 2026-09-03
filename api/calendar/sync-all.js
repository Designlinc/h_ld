// api/calendar/sync-all.js — bulk re-sync every upcoming appointment to a
// specific connected calendar provider, for the "Sync now" action next to
// each connection in Settings > Connected Accounts. Exists for recovering
// from a calendar that's drifted out of sync with h_ld more broadly than
// a single appointment — e.g. after reconnecting a calendar account, or
// when several appointments have been affected at once — without having
// to open and re-save each booking individually.
import sql from '../../lib/db.js';
import { requireAuth } from '../../lib/auth.js';
import { requireOrg } from '../../lib/tenant.js';
import { syncBookingToProvider } from '../../lib/calendarSync.js';

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

  // Upcoming and not cancelled/no-show — matches the same definition of
  // "active" bookings used elsewhere (the public availability check in
  // api/bookings/index.js), so this doesn't waste time re-syncing
  // appointments that are already done or were called off.
  const today = new Date().toISOString().slice(0, 10);
  const bookings = await sql`
    SELECT * FROM bookings
    WHERE organization_id = ${org.id} AND practitioner_id = ${auth.practitioner_id}
    AND date >= ${today} AND status NOT IN ('cancelled', 'noshow')
    ORDER BY date ASC, time ASC
  `;

  let succeeded = 0;
  const failures = [];
  for (const b of bookings) {
    const result = await syncBookingToProvider(b, provider, auth.practitioner_id, org);
    if (result.ok) succeeded++;
    else failures.push({ id: b.id, client: b.client_name, error: result.error });
  }

  return res.json({ ok: true, total: bookings.length, succeeded, failed: failures.length, failures });
}
