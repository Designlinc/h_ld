// api/bookings/index.js - GET all, POST create, PUT bulk sync
import sql from '../../lib/db.js';
import { requireAuth, verifyToken } from '../../lib/auth.js';

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

// Helper - replace template variables
function fillTemplate(tmpl, booking, settings) {
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
    .replace(/\{business_name\}/g, settings?.bizName || 'Solful Kinesiology')
    .replace(/\{cancel_policy\}/g, settings?.cancelPolicy || '')
    .replace(/\{intake_form_button\}/g, `https://soulful-booking.vercel.app/solful-intake.html?booking=${booking.id}`);
}

// Load settings and templates from DB
async function loadSettingsAndTemplates() {
  try {
    const rows = await sql`SELECT key, value FROM settings WHERE key IN ('app_settings', 'msg_templates')`;
    const result = {};
    rows.forEach(r => { result[r.key] = r.value; });
    return result;
  } catch { return {}; }
}

// Send SMS via ClickSend
async function sendSms(phone, message) {
  const username = process.env.CLICKSEND_USERNAME;
  const apiKey   = process.env.CLICKSEND_API_KEY;
  const sender   = process.env.CLICKSEND_SENDER || 'Solful';
  if (!username || !apiKey || !phone) return;
  const credentials = Buffer.from(`${username}:${apiKey}`).toString('base64');
  await fetch('https://rest.clicksend.com/v3/sms/send', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Basic ${credentials}` },
    body: JSON.stringify({ messages: [{ to: phone, body: message, from: sender, source: 'solful-booking' }] }),
  });
}

// Send email via Resend
async function sendEmail(to, subject, text) {
  const apiKey = process.env.RESEND_API_KEY;
  const from   = process.env.EMAIL_FROM || 'alicia@solful.com.au';
  if (!apiKey || !to) return;
  const html = `<!DOCTYPE html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#f0f4f2;margin:0;padding:20px">
<div style="max-width:560px;margin:0 auto;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,.08)">
  <div style="padding:28px 32px 0">
    <img src="https://soulful-booking.vercel.app/logo.png" style="width:100px;display:block;margin-bottom:24px" alt="Solful Kinesiology">
    <hr style="border:none;border-top:1px solid #E0E8E4;margin:0 0 20px">
    ${text.split('\n').map(line => {
      const t = line.trim();
      if (!t) return '';
      if (t.startsWith('https://') && t.includes('solful-intake')) {
        return `<div style="margin:16px 0;text-align:center"><a href="${t}" style="display:inline-block;background:#3D6B5C;color:#fff;text-decoration:none;padding:12px 24px;border-radius:8px;font-weight:600;font-size:14px">Complete Intake Form</a></div>`;
      }
      const locationMatch = t.match(/^Location:\s*(https?:\/\/\S+)\s*$/i);
      if (locationMatch) {
        return `<p style="margin:6px 0;font-size:15px;line-height:1.6">Location: <a href="${locationMatch[1]}" style="color:#3D6B5C;text-decoration:underline">${locationMatch[1]}</a></p>`;
      }
      return `<p style="margin:6px 0;font-size:15px;line-height:1.6">${t}</p>`;
    }).join('')}
  </div>
  <div style="padding:20px 32px;background:#f8faf9;margin-top:24px;text-align:center">
    <p style="margin:0;font-size:12px;color:#888">Solful Kinesiology</p>
  </div>
</div>
</body></html>`;
  await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
    body: JSON.stringify({ from, to, subject, text, html }),
  });
}

// Send confirmation SMS and email after booking creation
async function sendConfirmations(booking) {
  const data = await loadSettingsAndTemplates();
  const settings = data.app_settings || {};
  const templates = data.msg_templates || {};
  const confirmation = templates.confirmation || {};

  // SMS confirmation
  if (booking.client_phone) {
    const smsTmpl = confirmation.sms ||
      'Hi {client_name}, your {service} with {business_name} is confirmed for {date} at {time}. See you then!';
    const smsMsg = fillTemplate(smsTmpl, booking, settings);
    sendSms(booking.client_phone, smsMsg).catch(e => console.warn('SMS failed:', e.message));
  }

  // Email confirmation
  if (booking.client_email && confirmation.email?.body) {
    const emailBody = fillTemplate(confirmation.email.body, booking, settings);
    const emailSubject = fillTemplate(confirmation.email.subject || 'Booking Confirmed', booking, settings);
    sendEmail(booking.client_email, emailSubject, emailBody).catch(e => console.warn('Email failed:', e.message));
  }
}

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') return res.status(200).end();

  if (req.method === 'GET') {
    const auth = req.headers.authorization || '';
    const token = auth.startsWith('Bearer ') ? auth.slice(7) : null;
    const payload = token ? verifyToken(token) : null;

    if (payload) {
      const rows = await sql`SELECT * FROM bookings ORDER BY date DESC, time DESC`;
      return res.json(rows);
    } else {
      const { date } = req.query;
      if (!date) return res.json([]);
      const rows = await sql`
        SELECT date, time, duration, status FROM bookings
        WHERE date = ${date}
        AND status NOT IN ('cancelled', 'noshow')
      `;
      return res.json(rows);
    }
  }

  if (req.method === 'POST') {
    const b = req.body;
    const [row] = await sql`
      INSERT INTO bookings (
        id, client_name, client_email, client_phone, client_id,
        service_id, service_name, date, time, duration, price,
        location, status, practitioner_notes
      ) VALUES (
        ${b.id}, ${b.client}, ${b.email || null}, ${b.phone || null}, ${b.clientId || null},
        ${b.serviceId || null}, ${b.service}, ${b.date}, ${b.time}, ${b.duration || 60}, ${b.price || 0},
        ${b.location || null}, ${b.status || 'awaiting'}, ${b.practitionerNotes || null}
      )
      RETURNING *
    `;

    // Fire confirmations server-side (non-blocking)
    sendConfirmations(row).catch(e => console.warn('Confirmations failed:', e.message));

    return res.status(201).json(row);
  }

  if (!requireAuth(req, res)) return;

  if (req.method === 'PUT') {
    const bookings = Array.isArray(req.body) ? req.body : [];
    const incomingIds = bookings.map(b => b.id);

    if (incomingIds.length > 0) {
      await sql`
        DELETE FROM bookings
        WHERE NOT (id = ANY(SELECT jsonb_array_elements_text(${JSON.stringify(incomingIds)}::jsonb)))
      `;
    } else {
      await sql`DELETE FROM bookings`;
    }

    for (const b of bookings) {
      await sql`
        INSERT INTO bookings (
          id, client_name, client_email, client_phone, client_id,
          service_id, service_name, date, time, duration, price,
          location, status, payment_method, payment_amount, paid_at,
          practitioner_notes, intake_submitted, google_event_id, homework_reminder
        ) VALUES (
          ${b.id}, ${b.client}, ${b.email || null}, ${b.phone || null}, ${b.clientId || null},
          ${b.serviceId || null}, ${b.service}, ${b.date}, ${b.time}, ${b.duration || 60}, ${b.price || 0},
          ${b.location || null}, ${b.status || 'awaiting'}, ${b.paymentMethod || null},
          ${b.paymentAmount || null}, ${b.paidAt || null}, ${b.practitionerNotes || null},
          ${b.intakeSubmitted || false}, ${b.googleEventId || null},
          ${b.homeworkReminder ? JSON.stringify(b.homeworkReminder) : null}
        )
        ON CONFLICT (id) DO UPDATE SET
          client_name        = EXCLUDED.client_name,
          client_email       = EXCLUDED.client_email,
          client_phone       = EXCLUDED.client_phone,
          client_id          = EXCLUDED.client_id,
          service_id         = EXCLUDED.service_id,
          service_name       = EXCLUDED.service_name,
          date               = EXCLUDED.date,
          time               = EXCLUDED.time,
          duration           = EXCLUDED.duration,
          price              = EXCLUDED.price,
          location           = EXCLUDED.location,
          status             = EXCLUDED.status,
          payment_method     = EXCLUDED.payment_method,
          payment_amount     = EXCLUDED.payment_amount,
          paid_at            = EXCLUDED.paid_at,
          practitioner_notes = EXCLUDED.practitioner_notes,
          intake_submitted   = EXCLUDED.intake_submitted,
          google_event_id    = EXCLUDED.google_event_id,
          homework_reminder  = EXCLUDED.homework_reminder,
          updated_at         = NOW()
      `;
    }

    return res.json({ ok: true, count: bookings.length });
  }

  res.status(405).json({ error: 'Method not allowed' });
}
