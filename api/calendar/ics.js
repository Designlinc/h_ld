// api/calendar/ics.js — generates a standard .ics calendar file for a single
// booking. Linked from the "Add to Calendar" button in confirmation emails.
//
// Deliberately a plain iCalendar file rather than a "add to Google Calendar"
// link — a link like that only works for Google Calendar. A .ics download
// opens correctly in Apple Calendar, Outlook, Google Calendar, and anything
// else that understands the standard format, which covers every client
// without needing to detect which calendar app the recipient uses.
//
// Public on purpose, same as the intake form link already sent in these
// emails — a booking ID isn't a secret, and this only ever returns event
// details that were already in the email itself.
import sql from '../../lib/db.js';
import { requireOrg } from '../../lib/tenant.js';

function pad(n) { return String(n).padStart(2, '0'); }

// Floating local time (no Z, no TZID) — the server doesn't reliably know
// the practitioner's IANA timezone, only a free-text address. Floating time
// is interpreted by calendar apps as "this clock time, wherever you are",
// which matches how the confirmation email already shows the time with no
// timezone qualifier — correct as long as the client and practitioner share
// a timezone, which holds for the in-person local-business case this app
// is built around.
function toFloatingICSTime(dateStr, timeStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const [h, min] = timeStr.split(':').map(Number);
  return `${y}${pad(m)}${pad(d)}T${pad(h)}${pad(min)}00`;
}

function escapeICS(str) {
  return String(str || '')
    .replace(/\\/g, '\\\\')
    .replace(/,/g, '\\,')
    .replace(/;/g, '\\;')
    .replace(/\n/g, '\\n');
}

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const org = await requireOrg(req, res);
  if (!org) return;

  const bookingId = req.query.booking;
  if (!bookingId) return res.status(400).json({ error: 'Missing booking id' });

  const [b] = await sql`
    SELECT * FROM bookings WHERE id = ${bookingId} AND organization_id = ${org.id}
  `;
  if (!b) return res.status(404).json({ error: 'Booking not found' });

  const [settingsRow] = await sql`
    SELECT value FROM settings WHERE organization_id = ${org.id} AND key = 'app_settings'
  `;
  const settings = settingsRow?.value || {};
  const bizName = settings.bizName || org.name;

  const dateStr = typeof b.date === 'string' ? b.date.slice(0, 10) : new Date(b.date).toISOString().slice(0, 10);
  const timeStr = typeof b.time === 'string' ? b.time.slice(0, 5) : '09:00';

  const startDate = new Date(`${dateStr}T${timeStr}:00`);
  const endDate = new Date(startDate.getTime() + (b.duration || 60) * 60000);
  const endTimeStr = `${pad(endDate.getHours())}:${pad(endDate.getMinutes())}`;

  const dtstart = toFloatingICSTime(dateStr, timeStr);
  const dtend = toFloatingICSTime(dateStr, endTimeStr);

  const now = new Date();
  const dtstamp = `${now.getUTCFullYear()}${pad(now.getUTCMonth() + 1)}${pad(now.getUTCDate())}T${pad(now.getUTCHours())}${pad(now.getUTCMinutes())}${pad(now.getUTCSeconds())}Z`;

  const ics = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//h_ld//Booking//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:${b.id}@h-ld.com`,
    `DTSTAMP:${dtstamp}`,
    `DTSTART:${dtstart}`,
    `DTEND:${dtend}`,
    `SUMMARY:${escapeICS((b.service_name || 'Appointment') + ' — ' + bizName)}`,
    b.location ? `LOCATION:${escapeICS(b.location)}` : '',
    `DESCRIPTION:${escapeICS('Appointment with ' + bizName)}`,
    'STATUS:CONFIRMED',
    'END:VEVENT',
    'END:VCALENDAR',
  ].filter(Boolean).join('\r\n');

  res.setHeader('Content-Type', 'text/calendar; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="appointment.ics"');
  return res.status(200).send(ics);
}
