// api/admin/impersonate-request.js — send a consent request before
// impersonating, and check its status. SMS first, falling back to email
// if there's no phone number on file for this org.
import sql from '../../lib/db.js';
import { requireSuperAdmin } from '../../lib/auth.js';
import { renderEmail, buttonHtml } from '../../lib/emailTemplate.js';
import { randomBytes, randomUUID } from 'crypto';

const REQUEST_TTL_MINUTES = 30;
const CLICKSEND_USERNAME = process.env.CLICKSEND_USERNAME;
const CLICKSEND_API_KEY = process.env.CLICKSEND_API_KEY;
const RESEND_API_KEY = process.env.RESEND_API_KEY;
const FROM_EMAIL = process.env.MFA_FROM_EMAIL || 'h_ld. <noreply@h-ld.com>';

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') return res.status(200).end();

  const auth = requireSuperAdmin(req, res);
  if (!auth) return;

  if (req.method === 'POST') {
    const { organizationId, reason } = req.body || {};
    if (!organizationId) return res.status(400).json({ error: 'organizationId required' });

    const [org] = await sql`SELECT id, subdomain, name FROM organizations WHERE id = ${organizationId}`;
    if (!org) return res.status(404).json({ error: 'Organization not found' });

    const [practitioner] = await sql`
      SELECT id, email FROM practitioners WHERE organization_id = ${organizationId} ORDER BY created_at ASC LIMIT 1
    `;
    if (!practitioner) return res.status(400).json({ error: 'This organization has no practitioners' });

    const [settingsRow] = await sql`SELECT value FROM settings WHERE organization_id = ${organizationId} AND key = 'app_settings'`;
    const phone = settingsRow?.value?.phone;

    const token = randomBytes(24).toString('hex');
    const requestId = randomUUID();
    const expiresAt = new Date(Date.now() + REQUEST_TTL_MINUTES * 60 * 1000);

    await sql`
      INSERT INTO impersonation_requests (id, organization_id, practitioner_id, super_admin_id, reason, token, expires_at)
      VALUES (${requestId}, ${organizationId}, ${practitioner.id}, ${auth.super_admin_id}, ${reason || null}, ${token}, ${expiresAt})
    `;

    const link = `https://${org.subdomain}.h-ld.com/admin.html?consent_token=${token}`;
    let sentVia = null;

    // Business-listed phone (what clients see on the booking page), not
    // necessarily a personal mobile — worth knowing it's the only phone
    // number the system currently tracks.
    if (phone && CLICKSEND_USERNAME && CLICKSEND_API_KEY) {
      const smsBody = `h_ld. support needs temporary access to your account to help with your request. Approve here (expires in 30 min): ${link}`;
      try {
        const smsRes = await fetch('https://rest.clicksend.com/v3/sms/send', {
          method: 'POST',
          headers: {
            Authorization: 'Basic ' + Buffer.from(`${CLICKSEND_USERNAME}:${CLICKSEND_API_KEY}`).toString('base64'),
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ messages: [{ to: phone, body: smsBody, from: 'h_ld.', source: 'h_ld' }] }),
        });
        const smsData = await smsRes.json();
        if (smsRes.ok && smsData?.response_code === 'SUCCESS') sentVia = 'sms';
      } catch (err) {
        console.warn('Impersonation request SMS failed:', err.message);
      }
    }

    if (!sentVia && RESEND_API_KEY) {
      try {
        const emailRes = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: { Authorization: `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            from: FROM_EMAIL,
            to: practitioner.email,
            subject: 'h_ld. support is requesting access to your account',
            html: renderEmail({ bodyHtml: `
              <p style="margin:0 0 8px;font-size:15px;color:#231F20;line-height:1.6">h_ld. support needs temporary access to your account to help with your request.</p>
              ${buttonHtml(link, 'Review and respond')}
              <p style="margin:0;font-size:13px;color:#8A868A;line-height:1.6">This link expires in ${REQUEST_TTL_MINUTES} minutes.</p>
            ` }),
          }),
        });
        if (emailRes.ok) sentVia = 'email';
      } catch (err) {
        console.warn('Impersonation request email failed:', err.message);
      }
    }

    if (!sentVia) {
      return res.status(500).json({ error: 'Could not reach this practitioner — no phone/email on file, or sending failed' });
    }

    return res.json({ ok: true, requestId, sentVia });
  }

  if (req.method === 'GET') {
    const { requestId } = req.query;
    if (!requestId) return res.status(400).json({ error: 'requestId required' });
    const [request] = await sql`SELECT status FROM impersonation_requests WHERE id = ${requestId}`;
    if (!request) return res.status(404).json({ error: 'Request not found' });
    return res.json({ status: request.status });
  }

  res.status(405).json({ error: 'Method not allowed' });
}
