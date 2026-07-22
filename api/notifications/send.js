// api/notifications/send.js — Send SMS (ClickSend) or Email (Resend),
// logging every send to the communications table. This route previously
// had no organization scoping at all (any authenticated practitioner from
// any org could send through the shared ClickSend/Resend accounts to any
// number/address) and hardcoded Solful fallbacks (sender name, from
// address) — both fixed here alongside adding communications logging.
import sql from '../../lib/db.js';
import { requireAuth } from '../../lib/auth.js';
import { requireOrg } from '../../lib/tenant.js';
import { randomUUID } from 'crypto';

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') return res.status(200).end();

  const org = await requireOrg(req, res);
  if (!org) return;
  const auth = requireAuth(req, res, org);
  if (!auth) return;
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  // Explicit channel wins; otherwise infer from body shape so old callers
  // (subject => email, message => sms) keep working without changes.
  const channel = req.body?.channel || (req.body?.subject ? 'email' : req.body?.message ? 'sms' : null);

  if (channel === 'email') return sendEmail(req, res, org, auth);
  if (channel === 'sms') return sendSms(req, res, org, auth);

  return res.status(400).json({ error: 'Could not determine channel — pass "channel": "email" or "sms"' });
}

// `type` here is what actually shows in the practitioner's Communications
// dashboard — prefer a meaningful purpose (reminder/followup/confirmation,
// passed as commType from the caller) over the raw channel, since "what
// was this message for" matters more at a glance than "sms vs email".
// Falls back to channel when no purpose is given (e.g. ad-hoc messages).
async function logCommunication(org, auth, { commType, channel, toAddress, clientName, subject, message, status }) {
  try {
    await sql`
      INSERT INTO communications (id, organization_id, practitioner_id, type, to_address, client_name, subject, message, status, sent_at)
      VALUES (${randomUUID()}, ${org.id}, ${auth.practitioner_id}, ${commType || channel}, ${toAddress}, ${clientName || null}, ${subject || null}, ${message || null}, ${status}, ${status === 'sent' ? new Date().toISOString() : null})
    `;
  } catch (err) {
    // A logging failure should never take down the actual send — the
    // message already went out (or didn't); this is just the record of it.
    console.error('Failed to log communication:', err.message);
  }
}

async function sendSms(req, res, org, auth) {
  const { to, message, from, clientName, commType } = req.body;
  if (!to || !message) return res.status(400).json({ error: 'Missing to or message' });

  const username = process.env.CLICKSEND_USERNAME;
  const apiKey   = process.env.CLICKSEND_API_KEY;
  if (!username || !apiKey) return res.status(500).json({ error: 'SMS not configured — add CLICKSEND_USERNAME and CLICKSEND_API_KEY to Vercel environment variables' });

  const [settingsRow] = await sql`SELECT value FROM settings WHERE organization_id = ${org.id} AND key = 'app_settings'`;
  const orgSettings = settingsRow?.value || {};

  // Normalise recipients — accept string or array
  const recipients = Array.isArray(to) ? to : [to];

  const messages = recipients
    .filter(num => num && num.trim())
    .map(num => ({
      to:   num.trim().replace(/\s+/g, ''),
      body: message,
      source: 'h_ld',
      from: from || orgSettings.clickSendSender || org.name,
    }));

  if (!messages.length) return res.status(400).json({ error: 'No valid recipients' });

  try {
    const credentials = Buffer.from(`${username}:${apiKey}`).toString('base64');
    const response = await fetch('https://rest.clicksend.com/v3/sms/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Basic ${credentials}` },
      body: JSON.stringify({ messages }),
    });

    const data = await response.json();

    if (!response.ok) {
      console.error('ClickSend error:', JSON.stringify(data));
      await logCommunication(org, auth, { commType, channel: 'sms', toAddress: recipients[0], clientName, message, status: 'failed' });
      return res.status(500).json({ error: data.response_msg || 'ClickSend error', detail: data });
    }

    const results = data?.data?.messages || [];
    const succeeded = results.filter(m => m.status === 'SUCCESS').length;
    const failed    = results.filter(m => m.status !== 'SUCCESS').length;

    await logCommunication(org, auth, { commType, channel: 'sms', toAddress: recipients[0], clientName, message, status: succeeded > 0 ? 'sent' : 'failed' });

    return res.json({ ok: true, sent: succeeded, failed, total: messages.length, results });
  } catch (err) {
    console.error('SMS send error:', err.message);
    await logCommunication(org, auth, { commType, channel: 'sms', toAddress: recipients[0], clientName, message, status: 'failed' });
    return res.status(500).json({ error: err.message });
  }
}

async function sendEmail(req, res, org, auth) {
  const { to, subject, html, text, clientName, commType } = req.body;
  if (!to || !subject || (!html && !text)) {
    return res.status(400).json({ error: 'Missing to, subject, or body' });
  }

  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return res.status(500).json({ error: 'Email not configured — add RESEND_API_KEY to Vercel environment variables' });

  const [settingsRow] = await sql`SELECT value FROM settings WHERE organization_id = ${org.id} AND key = 'app_settings'`;
  const orgSettings = settingsRow?.value || {};
  const from = orgSettings.emailFrom || process.env.MFA_FROM_EMAIL || 'h_ld. <noreply@h-ld.com>';

  const recipients = Array.isArray(to) ? to : [to];

  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
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
      await logCommunication(org, auth, { commType, channel: 'email', toAddress: recipients[0], clientName, subject, message: text, status: 'failed' });
      return res.status(500).json({ error: data.message || 'Resend error', detail: data });
    }

    await logCommunication(org, auth, { commType, channel: 'email', toAddress: recipients[0], clientName, subject, message: text, status: 'sent' });

    return res.json({ ok: true, id: data.id });
  } catch (err) {
    console.error('Email send error:', err.message);
    await logCommunication(org, auth, { commType, channel: 'email', toAddress: recipients[0], clientName, subject, message: text, status: 'failed' });
    return res.status(500).json({ error: err.message });
  }
}
