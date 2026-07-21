// api/admin/message-practitioner.js — send an ad-hoc email to a
// practitioner directly from the super-admin console (e.g. while on a
// support call). Separate from anything a practitioner sends to their
// OWN clients — this is you messaging them, not them messaging anyone.
import sql from '../../lib/db.js';
import { requireSuperAdmin } from '../../lib/auth.js';
import { renderEmail } from '../../lib/emailTemplate.js';

const RESEND_API_KEY = process.env.RESEND_API_KEY;
const FROM_EMAIL = process.env.MFA_FROM_EMAIL || 'h_ld. <noreply@h-ld.com>';

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const auth = requireSuperAdmin(req, res);
  if (!auth) return;

  const { practitionerId, subject, message } = req.body || {};
  if (!practitionerId || !subject || !message) {
    return res.status(400).json({ error: 'practitionerId, subject, and message are all required' });
  }

  const [practitioner] = await sql`SELECT email, name FROM practitioners WHERE id = ${practitionerId}`;
  if (!practitioner) return res.status(404).json({ error: 'Practitioner not found' });

  if (!RESEND_API_KEY) {
    return res.status(500).json({ error: 'Email is not configured on this server' });
  }

  const bodyHtml = message.split('\n').map(line =>
    line.trim() ? `<p style="margin:0 0 12px;font-size:15px;line-height:1.6;color:#231F20">${line}</p>` : ''
  ).join('');

  const html = renderEmail({ bodyHtml, footerText: 'Sent from h_ld. support' });

  const emailRes = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: FROM_EMAIL, to: practitioner.email, subject, text: message, html }),
  });

  if (!emailRes.ok) {
    const errData = await emailRes.json().catch(() => ({}));
    console.error('message-practitioner send failed:', errData);
    return res.status(502).json({ error: 'Email failed to send' });
  }

  return res.json({ ok: true });
}
