// lib/calendarSync.js — pushes a single booking to a single connected
// calendar provider (Google or Microsoft). Extracted from
// api/calendar/sync.js so this same logic — including the fallback that
// recreates an event when the stored event ID has been manually deleted
// from the calendar — is shared between syncing one booking (from the
// booking edit modal) and bulk-syncing every upcoming booking at once
// (from the Connected Accounts "Sync now" button), rather than existing
// as two copies that could drift apart.
import sql from './db.js';
import { getValidGoogleToken } from './googleCalendar.js';
import { getValidMicrosoftToken } from './microsoftCalendar.js';

export async function syncBookingToProvider(booking, provider, practitionerId, org) {
  const b = booking;
  const paymentUrl = `https://${org.subdomain}.h-ld.com/pay.html?payment=${b.id}`;

  const dateStr = typeof b.date === 'string'
    ? b.date.slice(0, 10)
    : `${b.date.getUTCFullYear()}-${String(b.date.getUTCMonth()+1).padStart(2,'0')}-${String(b.date.getUTCDate()).padStart(2,'0')}`;

  let rawTime = b.time || '09:00';
  if (typeof rawTime === 'string' && rawTime.startsWith('"')) rawTime = JSON.parse(rawTime);
  const timeStr = rawTime.slice(0, 5);

  const startDt = new Date(`${dateStr}T${timeStr}:00`);
  if (isNaN(startDt.getTime())) return { ok: false, error: `Invalid date/time: ${dateStr} ${timeStr}` };
  const endDt = new Date(startDt.getTime() + (b.duration || 60) * 60000);
  const fmtDt = (dt) => {
    const y = dt.getFullYear(), mo = String(dt.getMonth()+1).padStart(2,'0'), day = String(dt.getDate()).padStart(2,'0');
    const h = String(dt.getHours()).padStart(2,'0'), m = String(dt.getMinutes()).padStart(2,'0');
    return `${y}-${mo}-${day}T${h}:${m}:00`;
  };

  const description = `Client: ${b.client_name}\nService: ${b.service_name}\nDuration: ${b.duration} min\nPrice: $${b.price}\n\n💳 Take payment:\n${paymentUrl}`;

  try {
    if (provider === 'google') {
      const accessToken = await getValidGoogleToken(practitionerId);
      const event = {
        summary: `${b.service_name} — ${b.client_name}`,
        description,
        start: { dateTime: fmtDt(startDt), timeZone: 'Australia/Sydney' },
        end:   { dateTime: fmtDt(endDt),   timeZone: 'Australia/Sydney' },
      };
      let gcRes = b.google_event_id
        ? await fetch(`https://www.googleapis.com/calendar/v3/calendars/primary/events/${b.google_event_id}`, {
            method: 'PUT', headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' }, body: JSON.stringify(event),
          })
        : await fetch('https://www.googleapis.com/calendar/v3/calendars/primary/events', {
            method: 'POST', headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' }, body: JSON.stringify(event),
          });
      // A stored event ID pointing at something that's been manually
      // deleted from the calendar fails the PUT with 404/410 — without
      // this fallback, that failure was reported back as-is and the
      // event was never actually recreated.
      if (!gcRes.ok && (gcRes.status === 404 || gcRes.status === 410)) {
        gcRes = await fetch('https://www.googleapis.com/calendar/v3/calendars/primary/events', {
          method: 'POST', headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' }, body: JSON.stringify(event),
        });
      }
      const gcData = await gcRes.json();
      if (gcData.id) {
        await sql`UPDATE bookings SET google_event_id = ${gcData.id} WHERE id = ${b.id} AND organization_id = ${org.id}`;
        return { ok: true, eventId: gcData.id, webLink: gcData.htmlLink };
      }
      return { ok: false, error: gcData.error?.message || 'Unknown error' };
    }

    if (provider === 'microsoft') {
      const accessToken = await getValidMicrosoftToken(practitionerId);
      const event = {
        subject: `${b.service_name} — ${b.client_name}`,
        body: { contentType: 'Text', content: description },
        start: { dateTime: fmtDt(startDt), timeZone: 'Australia/Sydney' },
        end:   { dateTime: fmtDt(endDt),   timeZone: 'Australia/Sydney' },
      };
      let msRes = b.microsoft_event_id
        ? await fetch(`https://graph.microsoft.com/v1.0/me/events/${b.microsoft_event_id}`, {
            method: 'PATCH', headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' }, body: JSON.stringify(event),
          })
        : await fetch('https://graph.microsoft.com/v1.0/me/events', {
            method: 'POST', headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' }, body: JSON.stringify(event),
          });
      if (!msRes.ok && msRes.status === 404) {
        msRes = await fetch('https://graph.microsoft.com/v1.0/me/events', {
          method: 'POST', headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' }, body: JSON.stringify(event),
        });
      }
      const msData = await msRes.json();
      if (msData.id) {
        await sql`UPDATE bookings SET microsoft_event_id = ${msData.id} WHERE id = ${b.id} AND organization_id = ${org.id}`;
        return { ok: true, eventId: msData.id, webLink: msData.webLink };
      }
      return { ok: false, error: msData.error?.message || 'Unknown error' };
    }

    return { ok: false, error: `Unknown provider: ${provider}` };
  } catch (err) {
    console.error(`Calendar sync error (${provider}):`, err);
    return { ok: false, error: err.message };
  }
}

// ── Live conflict check (2-way calendar sync) ──
//
// The external_calendar_events cache (populated by the daily cron job) is
// what the public booking page's availability list is checked against —
// good enough for deciding which slots to *show*, but on this plan's daily
// refresh a practitioner's calendar could be up to 24 hours stale by the
// time someone actually confirms a booking. This function is the
// authoritative, real-time check that runs once, at the moment of booking
// confirmation — it calls the provider directly rather than trusting the
// cache, so a same-day change to the practitioner's native calendar still
// can't be double-booked online.
//
// Deliberately fails OPEN, not closed: any error talking to Google or
// Microsoft (expired token, transient API failure, rate limit) returns
// `{ conflict: false, checked: false }` rather than blocking the booking.
// A slow or down calendar API must never be able to take the public
// booking page down with it — the cached-table check and this check are
// both best-effort layers on top of the bookings table itself, which
// remains the one thing that actually has to stay correct.

// Sydney's UTC offset shifts with daylight saving (AEST +10 / AEDT +11),
// and Vercel functions run in UTC — so `new Date('...T14:30:00')` with no
// offset is NOT reliably 2:30pm in Sydney. This resolves the real offset
// for a given date via Intl (no extra dependency) rather than assuming one.
function getSydneyOffsetMinutes(dateStr) {
  const probe = new Date(dateStr + 'T12:00:00Z');
  const parts = new Intl.DateTimeFormat('en-AU', {
    timeZone: 'Australia/Sydney',
    timeZoneName: 'shortOffset',
  }).formatToParts(probe);
  const tzName = parts.find(p => p.type === 'timeZoneName')?.value || 'GMT+10';
  const match = tzName.match(/GMT([+-]\d+)(?::(\d+))?/);
  const hours = match ? parseInt(match[1], 10) : 10;
  const mins = match && match[2] ? parseInt(match[2], 10) : 0;
  return hours * 60 + (hours < 0 ? -mins : mins);
}

// Converts a Sydney wall-clock date/time (as every booking's date/time is
// entered and displayed) into the true UTC instant it represents, correctly
// across the DST boundary — needed here because Google/Microsoft's
// availability APIs take real UTC instants, not "Australia/Sydney" as a
// label the way event-creation payloads elsewhere in this file do.
function sydneyWallTimeToUtc(dateStr, timeStr) {
  const offsetMin = getSydneyOffsetMinutes(dateStr);
  const [h, m] = timeStr.slice(0, 5).split(':').map(Number);
  const asIfUtc = new Date(`${dateStr}T${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:00Z`);
  return new Date(asIfUtc.getTime() - offsetMin * 60000);
}

async function checkGoogleFreeBusy(practitionerId, startDt, endDt) {
  const accessToken = await getValidGoogleToken(practitionerId);
  const res = await fetch('https://www.googleapis.com/calendar/v3/freeBusy', {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      timeMin: startDt.toISOString(),
      timeMax: endDt.toISOString(),
      items: [{ id: 'primary' }],
    }),
  });
  if (!res.ok) throw new Error(`Google freeBusy failed: ${res.status}`);
  const data = await res.json();
  const busy = data.calendars?.primary?.busy || [];
  return busy.length > 0;
}

// Microsoft Graph has no dedicated availability-only endpoint the way
// Google's freeBusy.query is — calendarView always returns full event
// details (a documented Graph limitation, not an oversight here). Since
// this check only needs a yes/no answer, the event contents are read and
// then discarded — never stored, never exposed in the API response.
// `Prefer: outlook.timezone="UTC"` is required or timestamps come back in
// whatever timezone the mailbox happens to be configured for.
async function checkMicrosoftBusy(practitionerId, startDt, endDt) {
  const accessToken = await getValidMicrosoftToken(practitionerId);
  const params = new URLSearchParams({
    startDateTime: startDt.toISOString(),
    endDateTime: endDt.toISOString(),
    $select: 'showAs,isCancelled,isAllDay',
  });
  const res = await fetch(`https://graph.microsoft.com/v1.0/me/calendarView?${params}`, {
    headers: { Authorization: `Bearer ${accessToken}`, Prefer: 'outlook.timezone="UTC"' },
  });
  if (!res.ok) throw new Error(`Microsoft calendarView failed: ${res.status}`);
  const data = await res.json();
  const busyEvents = (data.value || []).filter(e => !e.isCancelled && !e.isAllDay && e.showAs !== 'free');
  return busyEvents.length > 0;
}

export async function hasCalendarConflict(practitionerId, dateStr, timeStr, duration) {
  if (!practitionerId) return { conflict: false, checked: false };
  try {
    const connectedProviders = await sql`
      SELECT provider FROM oauth_tokens WHERE practitioner_id = ${practitionerId} AND provider IN ('google', 'microsoft')
    `;
    if (!connectedProviders.length) return { conflict: false, checked: true };

    const startDt = sydneyWallTimeToUtc(dateStr, timeStr);
    const endDt = new Date(startDt.getTime() + (duration || 60) * 60000);

    for (const { provider } of connectedProviders) {
      if (provider === 'google') {
        const busy = await checkGoogleFreeBusy(practitionerId, startDt, endDt);
        if (busy) return { conflict: true, checked: true, provider: 'google' };
      } else if (provider === 'microsoft') {
        const busy = await checkMicrosoftBusy(practitionerId, startDt, endDt);
        if (busy) return { conflict: true, checked: true, provider: 'microsoft' };
      }
    }
    return { conflict: false, checked: true };
  } catch (err) {
    console.warn('[hasCalendarConflict] Live check failed, proceeding without it:', err.message);
    return { conflict: false, checked: false };
  }
}

// ── External calendar event pull (2-way calendar sync, inbound direction) ──
//
// Refreshes the external_calendar_events cache for ONE practitioner/provider
// pair — pulling events from their native calendar and upserting them,
// same as syncBookingToProvider above does for the opposite (h_ld → native
// calendar) direction. Extracted here, rather than living only inside the
// cron job, so the same code runs on the daily schedule AND on demand from
// the "Sync now" button in Settings > Connected Accounts (see
// api/calendar/sync-external.js) — one implementation, not two that could
// drift apart, matching the same reasoning syncBookingToProvider's own
// comment above already gives for that button's other half.
const EXTERNAL_SYNC_WINDOW_DAYS = 60;

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

export async function syncExternalCalendarForPractitioner(practitionerId, provider) {
  const now = new Date();
  const timeMinIso = now.toISOString();
  const timeMaxIso = new Date(now.getTime() + EXTERNAL_SYNC_WINDOW_DAYS * 24 * 60 * 60 * 1000).toISOString();

  const ownEventRows = await sql`
    SELECT google_event_id, microsoft_event_id FROM bookings
    WHERE practitioner_id = ${practitionerId}
    AND (google_event_id IS NOT NULL OR microsoft_event_id IS NOT NULL)
  `;
  // Never cache an event that's actually one of this practitioner's own
  // h_ld bookings — those already render from the bookings table itself,
  // with full detail, on both the admin and public sides. Showing them a
  // second time as an "external" block would double-count them as busy
  // (harmless) but also, on the admin calendar, show a duplicate
  // greyed-out block behind every real booking.
  const ownEventIds = new Set(
    provider === 'google'
      ? ownEventRows.map(r => r.google_event_id).filter(Boolean)
      : ownEventRows.map(r => r.microsoft_event_id).filter(Boolean)
  );

  let events = provider === 'google'
    ? await fetchGoogleEvents(practitionerId, timeMinIso, timeMaxIso)
    : await fetchMicrosoftEvents(practitionerId, timeMinIso, timeMaxIso);
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
