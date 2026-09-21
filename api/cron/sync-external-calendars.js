// api/cron/sync-external-calendars.js — periodic refresh of the
// external_calendar_events cache (2-way calendar sync).
//
// For every practitioner with a connected Google and/or Microsoft calendar,
// pulls events over the next 60 days, filters out cancelled/all-day/free
// events and the practitioner's own h_ld-created bookings (already tracked
// separately via bookings.google_event_id / microsoft_event_id — without
// this filter, every h_ld booking would double up as its own greyed-out
// "external" block), and upserts the rest into external_calendar_events.
// Entries no longer present in the fetched window are deleted, so a
// deleted/moved native-calendar event stops blocking or showing up.
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
// header for a manual refresh or troubleshooting.
import sql from '../../lib/db.js';
import { getValidGoogleToken } from '../../lib/googleCalendar.js';
import { getValidMicrosoftToken } from '../../lib/microsoftCalendar.js';

const WINDOW_DAYS = 60;

async function fetchGoogleEvents(practitionerId, timeMinIso, timeMaxIso) {
  const accessToken = await getValidGoogleToken(practitionerId);
  const params = new URLSearchParams({
    timeMin: timeMinIso,
    timeMax: timeMaxIso,
    singleEvents: 'true',
    orderBy: 'startTime',
    maxResults: '250',
  });
  const res = await fetch(`https://www.googleapis.com/calendar/v3/calendars/primary/events?${params}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) throw new Error(`Google events.list failed: ${res.status}`);
  const data = await res.json();
  return (data.items || [])
    // e.start.date (not dateTime) marks an all-day event — those don't
    // represent a specific busy time range and are excluded, same as
    // transparent ("free") events and anything cancelled.
    .filter(e => e.status !== 'cancelled' && e.transparency !== 'transparent' && e.start?.dateTime && e.end?.dateTime)
    .map(e => ({ eventId: e.id, title: e.summary || '(No title)', start: e.start.dateTime, end: e.end.dateTime }));
}

async function fetchMicrosoftEvents(practitionerId, startIso, endIso) {
  const accessToken = await getValidMicrosoftToken(practitionerId);
  const params = new URLSearchParams({ startDateTime: startIso, endDateTime: endIso, $top: '250' });
  const res = await fetch(`https://graph.microsoft.com/v1.0/me/calendarView?${params}`, {
    // Without this header, start/end times come back in whatever timezone
    // the mailbox happens to be configured for — not necessarily UTC or
    // Australia/Sydney — which would silently corrupt every stored time.
    headers: { Authorization: `Bearer ${accessToken}`, Prefer: 'outlook.timezone="UTC"' },
  });
  if (!res.ok) throw new Error(`Microsoft calendarView failed: ${res.status}`);
  const data = await res.json();
  return (data.value || [])
    .filter(e => !e.isCancelled && !e.isAllDay && e.showAs !== 'free' && e.start?.dateTime && e.end?.dateTime)
    // Graph returns a naive datetime string (no offset) when the UTC
    // preference above is honoured — appending 'Z' is what makes it a
    // correctly-parseable absolute instant rather than an ambiguous one.
    .map(e => ({ eventId: e.id, title: e.subject || '(No title)', start: e.start.dateTime + 'Z', end: e.end.dateTime + 'Z' }));
}

async function syncPractitionerProvider(practitionerId, provider, timeMinIso, timeMaxIso, ownEventIds) {
  let events;
  if (provider === 'google') {
    events = await fetchGoogleEvents(practitionerId, timeMinIso, timeMaxIso);
  } else {
    events = await fetchMicrosoftEvents(practitionerId, timeMinIso, timeMaxIso);
  }

  // Never cache an event that's actually one of this practitioner's own
  // h_ld bookings — those already render from the bookings table itself,
  // with full detail, on both the admin and public sides. Showing them a
  // second time as an "external" block would double-count them as busy
  // (harmless) but also, on the admin calendar, show a duplicate
  // greyed-out block behind every real booking.
  events = events.filter(e => !ownEventIds.has(e.eventId));

  const currentIds = events.map(e => e.eventId);

  for (const e of events) {
    await sql`
      INSERT INTO external_calendar_events (practitioner_id, provider, event_id, title, start_time, end_time, last_synced_at)
      VALUES (${practitionerId}, ${provider}, ${e.eventId}, ${e.title}, ${e.start}, ${e.end}, NOW())
      ON CONFLICT (practitioner_id, provider, event_id) DO UPDATE SET
        title          = EXCLUDED.title,
        start_time     = EXCLUDED.start_time,
        end_time       = EXCLUDED.end_time,
        last_synced_at = NOW()
    `;
  }

  // Remove anything previously cached for this practitioner/provider that
  // wasn't seen in this fetch — covers events deleted, moved outside the
  // sync window, or newly excluded because they've become an h_ld booking.
  if (currentIds.length > 0) {
    await sql`
      DELETE FROM external_calendar_events
      WHERE practitioner_id = ${practitionerId} AND provider = ${provider}
      AND NOT (event_id = ANY(SELECT jsonb_array_elements_text(${JSON.stringify(currentIds)}::jsonb)))
    `;
  } else {
    await sql`DELETE FROM external_calendar_events WHERE practitioner_id = ${practitionerId} AND provider = ${provider}`;
  }

  return events.length;
}

export default async function handler(req, res) {
  const auth = req.headers.authorization || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : null;
  if (!process.env.CRON_SECRET || token !== process.env.CRON_SECRET) {
    return res.status(401).json({ error: 'Unauthorised' });
  }

  const now = new Date();
  const timeMinIso = now.toISOString();
  const timeMaxIso = new Date(now.getTime() + WINDOW_DAYS * 24 * 60 * 60 * 1000).toISOString();

  const connections = await sql`
    SELECT practitioner_id, provider FROM oauth_tokens WHERE provider IN ('google', 'microsoft')
  `;

  const results = [];
  for (const { practitioner_id: practitionerId, provider } of connections) {
    try {
      const ownEventRows = await sql`
        SELECT google_event_id, microsoft_event_id FROM bookings
        WHERE practitioner_id = ${practitionerId}
        AND (google_event_id IS NOT NULL OR microsoft_event_id IS NOT NULL)
      `;
      const ownEventIds = new Set(
        provider === 'google'
          ? ownEventRows.map(r => r.google_event_id).filter(Boolean)
          : ownEventRows.map(r => r.microsoft_event_id).filter(Boolean)
      );

      const count = await syncPractitionerProvider(practitionerId, provider, timeMinIso, timeMaxIso, ownEventIds);
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
