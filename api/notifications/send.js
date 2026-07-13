// api/notifications/send.js — Send SMS (ClickSend) or Email (Resend) from one route
// Replaces api/sms/send.js and api/email/send.js
import { requireAuth } from '../../lib/auth.js';

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (!requireAuth(req, res)) return;
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  // Explicit channel wins; otherwise infer from body shape so old callers
  // (subject => email, message => sms) keep working without changes.
  const channel = req.body?.channel || (req.body?.subject ? 'email' : req.body?.message ? 'sms' : null);

  if (channel === 'email') return sendEmail(req, res);
  if (channel === 'sms') return sendSms(req, res);

  return res.status(400).json({ error: 'Could not determine channel — pass "channel": "email" or "sms"' });
}

async function sendSms(req, res) {
  const { to, message, from } = req.body;
  if (!to || !message) return res.status(400).json({ error: 'Missing to or message' });

  const username = process.env.CLICKSEND_USERNAME;
  const apiKey   = process.env.CLICKSEND_API_KEY;
  if (!username || !apiKey) return res.status(500).json({ error: 'SMS not configured — add CLICKSEND_USERNAME and CLICKSEND_API_KEY to Vercel environment variables' });

  // Normalise recipients — accept string or array
  const recipients = Array.isArray(to) ? to : [to];

  // Build ClickSend messages array
  const messages = recipients
    .filter(num => num && num.trim())
    .map(num => ({
      to:   num.trim().replace(/\s+/g, ''),
      body: message,
      source: 'solful-booking',
      // Optional sender name (alphanumeric, max 11 chars) — shows as sender on client's phone
      // Must be registered with ClickSend for some countries
      from: from || process.env.CLICKSEND_SENDER || 'Solful',
    }));

  if (!messages.length) return res.status(400).json({ error: 'No valid recipients' });

  try {
    const credentials = Buffer.from(`${username}:${apiKey}`).toString('base64');
    const response = await fetch('https://rest.clicksend.com/v3/sms/send', {
      method: 'POST',
      headers: {
        'Content-Type':  'application/json',
        'Authorization': `Basic ${credentials}`,
      },
      body: JSON.stringify({ messages }),
    });

    const data = await response.json();

    if (!response.ok) {
      console.error('ClickSend error:', JSON.stringify(data));
      return res.status(500).json({ error: data.response_msg || 'ClickSend error', detail: data });
    }

    // Count successes and failures
    const results = data?.data?.messages || [];
    const succeeded = results.filter(m => m.status === 'SUCCESS').length;
    const failed    = results.filter(m => m.status !== 'SUCCESS').length;

    return res.json({
      ok: true,
      sent: succeeded,
      failed,
      total: messages.length,
      results,
    });

  } catch(err) {
    console.error('SMS send error:', err.message);
    return res.status(500).json({ error: err.message });
  }
}

async function sendEmail(req, res) {
  const { to, subject, html, text } = req.body;
  if (!to || !subject || (!html && !text)) {
    return res.status(400).json({ error: 'Missing to, subject, or body' });
  }

  const apiKey = process.env.RESEND_API_KEY;
  const from   = process.env.EMAIL_FROM || 'alicia@solful.com.au';
  if (!apiKey) return res.status(500).json({ error: 'Email not configured - add RESEND_API_KEY to Vercel environment variables' });

  // Normalise recipients
  const recipients = Array.isArray(to) ? to : [to];

  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Content-Type':  'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        from,
        to: recipients,
        subject,
        html: html || `<p>${text}</p>`,
        text: text || html?.replace(/<[^>]+>/g, ''),
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      console.error('Resend error:', JSON.stringify(data));
      return res.status(500).json({ error: data.message || 'Resend error', detail: data });
    }

    return res.json({ ok: true, id: data.id });

  } catch(err) {
    console.error('Email send error:', err.message);
    return res.status(500).json({ error: err.message });
  }
}
