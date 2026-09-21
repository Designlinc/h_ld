// api/bookings/index.js - GET all, POST create, PUT bulk sync
import { waitUntil } from '@vercel/functions';
import sql from '../../lib/db.js';
import { requireAuth, verifyToken } from '../../lib/auth.js';
import { requireOrg } from '../../lib/tenant.js';
import { renderEmail } from '../../lib/emailTemplate.js';
import { buildPractitionerEmailHtml } from '../../lib/practitionerEmailTemplate.js';
import { generateInvoiceForBooking } from '../../lib/invoices.js';
import { sanitizeSenderId, normalizePhoneAU } from '../../lib/sms.js';
import { syncBookingToProvider, hasCalendarConflict } from '../../lib/calendarSync.js';

// Helper - format time to 12hr
function fmtTime(t) {
  if (!t) return '';
  let s = typeof t === 'string' && t.startsWith('"') ? JSON.parse(t) : t;
  s = s.slice(0, 5);
  const [h, m] = s.split(':').map(Number);
  return `${h % 12 || 12}:${String(m).padStart(2,'0')}${h < 12 ? 'am' : 'pm'}`;
}

// Helper - format date to readable string
function fmtDate(d) {
  // Postgres DATE columns can come back as either a plain string or a JS
  // Date object depending on the driver — concatenating a Date object
  // with a string via + coerces it through .toString() first, producing
  // something like "Tue Sep 15 2026 00:00:00 GMT+...T00:00:00" that
  // new Date() can't parse at all, silently yielding "Invalid Date".
  // Normalise both shapes to a plain YYYY-MM-DD string first. UTC getters
  // specifically — a DATE column represents midnight UTC, so local
  // getters could shift the date by a day depending on the server's
  // timezone offset.
  const raw = typeof d === 'string'
    ? d.slice(0, 10)
    : `${d.getUTCFullYear()}-${String(d.getUTCMonth()+1).padStart(2,'0')}-${String(d.getUTCDate()).padStart(2,'0')}`;
  const dt = new Date(raw + 'T00:00:00');
  return dt.toLocaleDateString('en-AU', { weekday:'long', day:'numeric', month:'long' });
}

// Helper - replace template variables. `org` supplies the intake-form URL,
// since that now depends on which subdomain this organization owns rather
// than being one hardcoded Solful URL for everyone.
function fillTemplate(tmpl, booking, settings, org) {
  const name = (booking.client_name || '').split(' ')[0];
  return tmpl
    .replace(/\{client_name\}/g, name)
    .replace(/\{service\}/g, booking.service_name || '')
    .replace(/\{date\}/g, fmtDate(booking.date))
    .replace(/\{time\}/g, fmtTime(booking.time))
    .replace(/\{duration\}/g, (booking.duration || 60) + ' minutes')
    .replace(/\{price\}/g, '$' + (booking.price || 0))
    .replace(/\{location\}/g, booking.location || settings?.address || '')
    .replace(/\{practitioner\}/g, settings?.pracName || '')
    .replace(/\{business_name\}/g, settings?.bizName || org.name)
    .replace(/\{cancel_policy\}/g, settings?.cancelPolicy || '')
    .replace(/\{intake_form_button\}/g, `https://${org.subdomain}.h-ld.com/intake.html?booking=${booking.id}`)
    .replace(/\{add_to_calendar_button\}/g, `https://${org.subdomain}.h-ld.com/api/calendar/ics?booking=${booking.id}`);
}

// Load this organization's settings and message templates
async function loadSettingsAndTemplates(orgId) {
  try {
    const rows = await sql`
      SELECT key, value FROM settings
      WHERE organization_id = ${orgId} AND key IN ('app_settings', 'msg_templates')
    `;
    const result = {};
    rows.forEach(r => { result[r.key] = r.value; });
    return result;
  } catch { return {}; }
}

// Send SMS via ClickSend — sender name comes from this org's settings, not
// a hardcoded brand, falling back to the org's own name if unset.
// Retries once on a network-level failure ("fetch failed" is Node's
// generic error for this — DNS hiccup, connection reset, brief outage)
// before giving up. Doesn't retry on the request actually completing
// with an error status — only on the request failing to complete at all.
async function fetchWithRetry(url, options) {
  try {
    return await fetch(url, options);
  } catch (err) {
    console.warn(`Fetch to ${url} failed, retrying once:`, err.message);
    await new Promise(r => setTimeout(r, 500));
    return fetch(url, options);
  }
}

async function sendSms(phone, message, org, settings) {
  const username = process.env.CLICKSEND_USERNAME;
  const apiKey   = process.env.CLICKSEND_API_KEY;
  const sender   = sanitizeSenderId(settings?.clickSendSender || org.name);
  if (!username || !apiKey || !phone) return;
  const credentials = Buffer.from(`${username}:${apiKey}`).toString('base64');
  await fetchWithRetry('https://rest.clicksend.com/v3/sms/send', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Basic ${credentials}` },
    body: JSON.stringify({ messages: [{ to: normalizePhoneAU(phone), body: message, from: sender, source: 'h_ld' }] }),
  });
}

// Send email via Resend. Client-facing sender shows the practitioner's own
// business name rather than "h_ld." — sent via h_ld's verified domain for
// deliverability (an arbitrary practitioner email domain isn't SPF/DKIM
// verified with Resend, so using it directly as the From address would get
// flagged as spam or rejected outright), with Reply-To set to the
// practitioner's real inbox so hitting "reply" still reaches them directly.
// `settings.emailFrom` remains a manual override for anyone who's set up
// their own verified sending domain.
// Client-facing email — uses the PRACTITIONER'S OWN branding (their logo,
// business name, colors), not h_ld's. This is a direct port of admin.html's
// buildEmailHtml(), which previously only ran client-side when a
// practitioner created a booking from the admin panel — bookings created
// via the public booking page had no way to reach that logic at all,
// silently falling back to h_ld's own system-email template instead.
async function sendClientEmail(to, subject, text, org, settings) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey || !to) return;

  const senderName = settings?.bizName || settings?.pracName || org.name;
  const from = settings?.emailFrom || `${senderName} <bookings@h-ld.com>`;
  const replyTo = settings?.email || undefined;

  const html = buildPractitionerEmailHtml(text, settings, org);
  await fetchWithRetry('https://api.resend.com/emails', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
    body: JSON.stringify({ from, to, subject, text, html, reply_to: replyTo }),
  });
}

// Practitioner-facing email — uses h_ld's OWN branding (renderEmail from
// lib/emailTemplate.js), which is what that template was actually built
// for: h_ld notifying a practitioner about their own system, not a
// client-facing message that should carry the practitioner's brand.
async function sendPractitionerEmail(to, subject, text, org, settings) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey || !to) return;

  const senderName = settings?.bizName || settings?.pracName || org.name;
  const from = settings?.emailFrom || `${senderName} <bookings@h-ld.com>`;
  const replyTo = settings?.email || undefined;

  const bodyHtml = `
    <hr style="border:none;border-top:1px solid #DED9D7;margin:0 0 20px">
    ${text.split('\n').map(line => {
      const t = line.trim();
      if (!t) return '';
      return `<p style="margin:6px 0;font-size:15px;line-height:1.6;color:#231F20">${t}</p>`;
    }).join('')}
  `;

  const html = renderEmail({ bodyHtml, footerText: org.name });
  await fetchWithRetry('https://api.resend.com/emails', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
    body: JSON.stringify({ from, to, subject, text, html, reply_to: replyTo }),
  });
}

// Send confirmation SMS and email after booking creation
async function sendConfirmations(booking, org) {
  const data = await loadSettingsAndTemplates(org.id);
  const settings = data.app_settings || {};
  const templates = data.msg_templates || {};
  const confirmation = templates.confirmation || {};

  if (booking.client_phone) {
    const smsTmpl = confirmation.sms ||
      'Hi {client_name}, your {service} with {business_name} is confirmed for {date} at {time}. See you then!';
    const smsMsg = fillTemplate(smsTmpl, booking, settings, org);
    sendSms(booking.client_phone, smsMsg, org, settings).catch(e => console.warn('SMS failed:', e.message));
  }

  if (booking.client_email && confirmation.email?.body) {
    const emailBody = fillTemplate(confirmation.email.body, booking, settings, org);
    const emailSubject = fillTemplate(confirmation.email.subject || 'Booking Confirmed', booking, settings, org);
    sendClientEmail(booking.client_email, emailSubject, emailBody, org, settings).catch(e => console.warn('Email failed:', e.message));
  }
}

// Notify the practitioner themselves (not the client) that a new booking
// came in via the public booking page — separate from sendConfirmations
// above, which is client-facing. The master on/off (settings.notifyNewAppointment)
// and the editable template (templates.new_appointment, including its own
// per-channel email/sms toggles) both default to on, so existing
// practitioners who haven't touched either yet still get notified via
// both channels with the original message wording.
// Syncs a new booking to whichever calendar provider(s) the practitioner
// has connected — called directly, server-side, rather than relying on
// the public booking page making a separate HTTP request to
// /api/calendar/sync afterward. That endpoint requires requireAuth (a
// logged-in practitioner's token), which a client on the public booking
// page never has — meaning that separate request was failing with 401
// every single time, regardless of whether a calendar was actually
// connected or working correctly. Calling the same shared sync function
// directly here, from code that already runs fully server-side with no
// client auth involved at all, sidesteps that entirely.
async function syncNewBookingToCalendar(booking, org) {
  const practitionerId = booking.practitioner_id || null;
  if (!practitionerId) {
    console.log('[calendar-sync] Skipped — booking has no practitioner_id for org', org.id);
    return;
  }
  const connectedProviders = await sql`
    SELECT provider FROM oauth_tokens WHERE practitioner_id = ${practitionerId} AND provider IN ('google', 'microsoft')
  `;
  if (!connectedProviders.length) {
    console.log('[calendar-sync] Skipped — no calendar connected for practitioner', practitionerId);
    return;
  }
  for (const { provider } of connectedProviders) {
    const result = await syncBookingToProvider(booking, provider, practitionerId, org);
    if (result.ok) console.log(`[calendar-sync] Synced to ${provider} for booking`, booking.id);
    else console.warn(`[calendar-sync] Failed to sync to ${provider} for booking`, booking.id, '—', result.error);
  }
}

async function sendPractitionerNewBookingNotification(booking, org) {
  const data = await loadSettingsAndTemplates(org.id);
  const settings = data.app_settings || {};
  if (settings.notifyNewAppointment === false) {
    console.log('[new-appt-notify] Skipped — notifyNewAppointment is explicitly false for org', org.id);
    return;
  }

  const templates = data.msg_templates || {};
  const tmpl = templates.new_appointment || {};
  const defaultMsg = 'You have a new appointment - {client_name}, {service}, {date}, {time}';
  const channels = tmpl.channels || { email: true, sms: true };

  console.log('[new-appt-notify] org', org.id, '— phone set:', !!settings.phone, '— email set:', !!settings.email, '— sms channel:', channels.sms, '— email channel:', channels.email);

  if (channels.sms !== false && settings.phone) {
    const smsMsg = fillTemplate(tmpl.sms || defaultMsg, booking, settings, org);
    sendSms(settings.phone, smsMsg, org, settings)
      .then(() => console.log('[new-appt-notify] SMS sent to practitioner for org', org.id))
      .catch(e => console.warn('[new-appt-notify] SMS failed:', e.message));
  } else if (!settings.phone) {
    console.log('[new-appt-notify] Skipped SMS — no phone number set in practitioner settings for org', org.id);
  }
  if (channels.email !== false && settings.email) {
    const emailSubject = fillTemplate(tmpl.email?.subject || 'New appointment booked', booking, settings, org);
    const emailBody = fillTemplate(tmpl.email?.body || defaultMsg, booking, settings, org);
    sendPractitionerEmail(settings.email, emailSubject, emailBody, org, settings)
      .then(() => console.log('[new-appt-notify] Email sent to practitioner for org', org.id))
      .catch(e => console.warn('[new-appt-notify] Email failed:', e.message));
  } else if (!settings.email) {
    console.log('[new-appt-notify] Skipped email — no email address set in practitioner settings for org', org.id);
  }
}

export default async function handler(req, res) {
  try {
    if (req.method === 'OPTIONS') return res.status(200).end();

    // Every method here needs to know which organization this request is
    // for, resolved from the subdomain — including the public GET/POST used
    // by the client-facing booking page, since availability and new bookings
    // are just as tenant-specific as anything in the admin app.
    const org = await requireOrg(req, res);
    if (!org) return;

    if (req.method === 'GET') {
      const auth = req.headers.authorization || '';
      const token = auth.startsWith('Bearer ') ? auth.slice(7) : null;
      // Not using requireAuth here on purpose — an invalid/missing token
      // just falls through to the public availability view below rather
      // than rejecting the request, since this GET serves two audiences.
      const payload = token ? verifyToken(token) : null;

      if (payload && payload.organization_id === org.id) {
        const rows = await sql`
          SELECT * FROM bookings WHERE organization_id = ${org.id} ORDER BY date DESC, time DESC
        `;
        return res.json(rows);
      } else {
        const { date } = req.query;
        if (!date) return res.json([]);
        const rows = await sql`
          SELECT date, time, duration, status FROM bookings
          WHERE organization_id = ${org.id} AND date = ${date}
          AND status NOT IN ('cancelled', 'noshow')
        `;

        // Merge in cached external-calendar busy blocks (2-way calendar
        // sync) — same {date, time, duration, status} shape as a real
        // booking row, so the slot-availability logic already in
        // book.html/booking.html blocks these times with no frontend
        // change needed. Deliberately carries no title, client name, or
        // any other detail — this is the public, unauthenticated view,
        // and a client must only ever see that a time is unavailable,
        // never what it's for. Titles are returned only to the
        // authenticated admin panel, via a separate endpoint
        // (api/calendar/external-events.js).
        let externalRows = [];
        try {
          externalRows = await sql`
            SELECT
              ${date}::text AS date,
              TO_CHAR(
                GREATEST(e.start_time, ${date}::timestamp AT TIME ZONE 'Australia/Sydney') AT TIME ZONE 'Australia/Sydney',
                'HH24:MI:SS'
              ) AS time,
              GREATEST(1, ROUND(EXTRACT(EPOCH FROM (
                LEAST(e.end_time, (${date}::date + 1)::timestamp AT TIME ZONE 'Australia/Sydney')
                - GREATEST(e.start_time, ${date}::timestamp AT TIME ZONE 'Australia/Sydney')
              )) / 60)) AS duration,
              'external'::text AS status
            FROM external_calendar_events e
            JOIN practitioners p ON p.id = e.practitioner_id
            WHERE p.organization_id = ${org.id}
            AND e.start_time < (${date}::date + 1)::timestamp AT TIME ZONE 'Australia/Sydney'
            AND e.end_time > ${date}::timestamp AT TIME ZONE 'Australia/Sydney'
          `;
        } catch (err) {
          // Fails open — e.g. on a database the migration hasn't reached
          // yet, public availability still works from real bookings alone
          // rather than the whole endpoint breaking.
          console.warn('[bookings GET] External calendar merge failed:', err.message);
        }

        return res.json([...rows, ...externalRows]);
      }
    }

    if (req.method === 'POST') {
      const b = req.body;

      // Solo practitioner today, but this looks ahead to multi-practitioner
      // organizations: if the client specified who they're booking with,
      // verify that practitioner actually belongs to this org; otherwise
      // default to the org's practitioner (works as-is while every org has
      // exactly one).
      let practitionerId = null;
      if (b.practitionerId) {
        const [p] = await sql`SELECT id FROM practitioners WHERE id = ${b.practitionerId} AND organization_id = ${org.id}`;
        practitionerId = p ? p.id : null;
      }
      if (!practitionerId) {
        const [p] = await sql`SELECT id FROM practitioners WHERE organization_id = ${org.id} ORDER BY created_at ASC LIMIT 1`;
        practitionerId = p ? p.id : null;
      }

      // Live conflict check (2-way calendar sync) — the cached external
      // events merged into GET above are only as fresh as the last cron
      // run (daily, on this plan), so a same-day change in the
      // practitioner's native calendar could otherwise slip through and
      // get double-booked. This is the one authoritative, real-time check
      // against the calendar provider itself, right before the booking is
      // actually written. It fails OPEN — any error talking to
      // Google/Microsoft returns checked:false and this simply proceeds,
      // exactly as if no calendar were connected at all, so a slow or
      // down calendar API can never take the public booking page down
      // with it. This route is only ever reached from the public booking
      // pages (book.html/booking.html) — admin bookings go through the
      // PUT bulk-sync route below, which intentionally has no such check
      // so the practitioner's manual working-hours override keeps working.
      if (practitionerId) {
        const liveCheck = await hasCalendarConflict(practitionerId, b.date, b.time, b.duration || 60);
        if (liveCheck.conflict) {
          return res.status(409).json({ error: 'That time was just taken in the practitioner’s calendar. Please choose another time.' });
        }
      }

      const [row] = await sql`
        INSERT INTO bookings (
          id, organization_id, practitioner_id, client_name, client_email, client_phone, client_id,
          service_id, service_name, date, time, duration, price,
          location, status, practitioner_notes
        ) VALUES (
          ${b.id}, ${org.id}, ${practitionerId}, ${b.client}, ${b.email || null}, ${b.phone || null}, ${b.clientId || null},
          ${b.serviceId || null}, ${b.service}, ${b.date}, ${b.time}, ${b.duration || 60}, ${b.price || 0},
          ${b.location || null}, ${b.status || 'awaiting'}, ${b.practitionerNotes || null}
        )
        RETURNING *
      `;

      // waitUntil (not a blocking await, not plain fire-and-forget) is
      // Vercel's own mechanism for exactly this situation: the response
      // goes back to the client immediately, while Vercel still
      // guarantees this background work actually finishes before the
      // function is torn down, unlike genuine fire-and-forget which had
      // no such guarantee.
      waitUntil(Promise.allSettled([
        sendConfirmations(row, org).catch(e => console.warn('Confirmations failed:', e.message)),
        sendPractitionerNewBookingNotification(row, org).catch(e => console.warn('Practitioner notification failed:', e.message)),
        syncNewBookingToCalendar(row, org).catch(e => console.warn('Calendar sync failed:', e.message)),
      ]));

      return res.status(201).json(row);
    }

    const auth = requireAuth(req, res, org);
    if (!auth) return;

    if (req.method === 'PUT') {
      const bookings = Array.isArray(req.body) ? req.body : [];
      const incomingIds = bookings.map(b => b.id);

      // Bulk sync only ever touches THIS org's bookings — the NOT-IN-list
      // delete is scoped by organization_id so it can never wipe another
      // tenant's data, even if the incoming ID list were somehow empty.
      if (incomingIds.length > 0) {
        await sql`
          DELETE FROM bookings
          WHERE organization_id = ${org.id}
          AND NOT (id = ANY(SELECT jsonb_array_elements_text(${JSON.stringify(incomingIds)}::jsonb)))
        `;
      } else {
        await sql`DELETE FROM bookings WHERE organization_id = ${org.id}`;
      }

      // Each booking is written independently — a bad row (stale
      // service_id/client_id reference, malformed date, etc) shouldn't
      // block every other booking in the same sync from saving. Failures
      // are collected and reported back instead of aborting the whole
      // batch on the first error.
      const failures = [];
      for (const b of bookings) {
        try {
          // Checked before the write so this reflects the state the booking
          // was in immediately prior to this sync, not after — needed to
          // detect a genuine unpaid-to-paid transition rather than firing
          // again on every subsequent sync of an already-paid booking.
          const [before] = await sql`SELECT paid_at FROM bookings WHERE id = ${b.id} AND organization_id = ${org.id}`;
          const wasUnpaid = !before?.paid_at;

          await sql`
            INSERT INTO bookings (
              id, organization_id, practitioner_id, client_name, client_email, client_phone, client_id,
              service_id, service_name, date, time, duration, price,
              location, status, payment_method, payment_amount, paid_at,
              practitioner_notes, intake_submitted, google_event_id, microsoft_event_id, homework_reminder
            ) VALUES (
              ${b.id}, ${org.id}, ${auth.practitioner_id}, ${b.client}, ${b.email || null}, ${b.phone || null}, ${b.clientId || null},
              ${b.serviceId || null}, ${b.service}, ${b.date}, ${b.time}, ${b.duration || 60}, ${b.price || 0},
              ${b.location || null}, ${b.status || 'awaiting'}, ${b.paymentMethod || null},
              ${b.paymentAmount || null}, ${b.paidAt || null}, ${b.practitionerNotes || null},
              ${b.intakeSubmitted || false}, ${b.googleEventId || null}, ${b.microsoftEventId || null},
              ${b.homeworkReminder ? JSON.stringify(b.homeworkReminder) : null}
            )
            ON CONFLICT (id) DO UPDATE SET
              client_name         = EXCLUDED.client_name,
              client_email        = EXCLUDED.client_email,
              client_phone        = EXCLUDED.client_phone,
              client_id           = EXCLUDED.client_id,
              service_id          = EXCLUDED.service_id,
              service_name        = EXCLUDED.service_name,
              date                = EXCLUDED.date,
              time                = EXCLUDED.time,
              duration            = EXCLUDED.duration,
              price               = EXCLUDED.price,
              location            = EXCLUDED.location,
              status              = EXCLUDED.status,
              payment_method      = EXCLUDED.payment_method,
              payment_amount      = EXCLUDED.payment_amount,
              paid_at             = EXCLUDED.paid_at,
              practitioner_notes  = EXCLUDED.practitioner_notes,
              intake_submitted    = EXCLUDED.intake_submitted,
              google_event_id     = EXCLUDED.google_event_id,
              microsoft_event_id  = EXCLUDED.microsoft_event_id,
              homework_reminder   = EXCLUDED.homework_reminder,
              updated_at          = NOW()
            WHERE bookings.organization_id = ${org.id}
          `;

          if (wasUnpaid && b.paidAt) {
            // Must be awaited, not fired in the background — Vercel can
            // freeze/tear down the function's execution environment the
            // moment the response is sent, which silently cuts off any
            // still-running database work that wasn't waited on. That's
            // exactly what was happening here (NeonDbError: fetch failed).
            // Wrapped in its own try/catch so a failure here still can't
            // fail the booking save itself.
            try {
              await generateInvoiceForBooking(b.id, org.id);
            } catch (err) {
              console.error('Invoice generation failed for booking', b.id, err);
            }
          }
        } catch (err) {
          console.error(`Booking ${b.id} failed to save:`, err.message);
          failures.push({ id: b.id, client: b.client, error: err.message });
        }
      }

      if (failures.length > 0) {
        // 207-style partial-failure response — some bookings saved, some
        // didn't. Still 200 so the client can see exactly which ones failed
        // and why, rather than only knowing "something in this batch broke".
        return res.status(200).json({ ok: failures.length < bookings.length, count: bookings.length - failures.length, failures });
      }

      return res.json({ ok: true, count: bookings.length });
    }

    res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    // Anything that reaches here would otherwise crash the function and
    // return Vercel's own generic (non-JSON) error page — which is why
    // failures were showing as an unhelpful "Request failed" client-side
    // instead of the actual database/validation error.
    console.error('Bookings API error:', err);
    return res.status(500).json({ error: err.message || 'Internal server error' });
  }
}
