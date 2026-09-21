// api/calendar/external-events.js — GET the cached external-calendar
// events (2-way sync) for this organization, WITH titles.
//
// Deliberately a separate, fully authenticated endpoint from the public
// booking pages' availability check in api/bookings/index.js, rather than
// an optional field on that shared GET handler — the privacy boundary
// here (client sees a blocked time only; the practitioner sees the real
// event title) is easiest to guarantee correctly by keeping "titled" and
// "public" as two routes that can never be reached by the wrong caller,
// instead of one route with a conditional that could be gotten wrong.
//
// Populated by api/cron/sync-external-calendars.js; this route only ever
// reads the cache, it never calls Google/Microsoft directly.
import sql from '../../lib/db.js';
import { requireAuth } from '../../lib/auth.js';
import { requireOrg } from '../../lib/tenant.js';

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).end();

  const org = await requireOrg(req, res);
  if (!org) return;
  const auth = requireAuth(req, res, org);
  if (!auth) return;

  const rows = await sql`
    SELECT e.event_id, e.provider, e.title, e.start_time, e.end_time
    FROM external_calendar_events e
    JOIN practitioners p ON p.id = e.practitioner_id
    WHERE p.organization_id = ${org.id}
    ORDER BY e.start_time ASC
  `;

  return res.json(rows);
}
