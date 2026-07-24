// api/bookings/index.js - GET all, POST create, PUT bulk sync
import sql from '../../lib/db.js';
import { requireAuth, verifyToken } from '../../lib/auth.js';
import { requireOrg } from '../../lib/tenant.js';
import { renderEmail } from '../../lib/emailTemplate.js';

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
  const raw = typeof d === 'string' ? d.slice(0,10) : d;
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
    .replace(/\{intake_form_button\}/g, `https://${org.subdomain}.h-ld.com/intake.html?booking=${booking.id}`);
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
async function sendSms(phone, message, org, settings) {
  const username = process.env.CLICKSEND_USERNAME;
  const apiKey   = process.env.CLICKSEND_API_KEY;
  const sender   = settings?.clickSendSender || org.name;
  if (!username || !apiKey || !phone) return;
  const credentials = Buffer.from(`${username}:${apiKey}`).toString('base64');
  await fetch('https://rest.clicksend.com/v3/sms/send', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Basic ${credentials}` },
    body: JSON.stringify({ messages: [{ to: phone, body: message, from: sender, source: 'h_ld' }] }),
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
async function sendEmail(to, subject, text, org, settings) {
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
      if (t.startsWith('https://') && t.includes('/intake.html')) {
        return `<div style="margin:16px 0;text-align:center"><a href="${t}" style="display:inline-block;background:#D84148;color:#fff;text-decoration:none;padding:12px 24px;border-radius:8px;font-weight:600;font-size:14px">Complete Intake Form</a></div>`;
      }
      const locationMatch = t.match(/^Location:\s*(https?:\/\/\S+)\s*$/i);
      if (locationMatch) {
        return `<p style="margin:6px 0;font-size:15px;line-height:1.6;color:#231F20">Location: <a href="${locationMatch[1]}" style="color:#D84148;text-decoration:underline">${locationMatch[1]}</a></p>`;
      }
      return `<p style="margin:6px 0;font-size:15px;line-height:1.6;color:#231F20">${t}</p>`;
    }).join('')}
  `;

  const html = renderEmail({ bodyHtml, footerText: org.name });
  await fetch('https://api.resend.com/emails', {
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
    sendEmail(booking.client_email, emailSubject, emailBody, org, settings).catch(e => console.warn('Email failed:', e.message));
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
        return res.json(rows);
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

      sendConfirmations(row, org).catch(e => console.warn('Confirmations failed:', e.message));

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
          await sql`
            INSERT INTO bookings (
              id, organization_id, practitioner_id, client_name, client_email, client_phone, client_id,
              service_id, service_name, date, time, duration, price,
              location, status, payment_method, payment_amount, paid_at,
              practitioner_notes, intake_submitted, google_event_id, homework_reminder
            ) VALUES (
              ${b.id}, ${org.id}, ${auth.practitioner_id}, ${b.client}, ${b.email || null}, ${b.phone || null}, ${b.clientId || null},
              ${b.serviceId || null}, ${b.service}, ${b.date}, ${b.time}, ${b.duration || 60}, ${b.price || 0},
              ${b.location || null}, ${b.status || 'awaiting'}, ${b.paymentMethod || null},
              ${b.paymentAmount || null}, ${b.paidAt || null}, ${b.practitionerNotes || null},
              ${b.intakeSubmitted || false}, ${b.googleEventId || null},
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
              homework_reminder   = EXCLUDED.homework_reminder,
              updated_at          = NOW()
            WHERE bookings.organization_id = ${org.id}
          `;
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
