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
