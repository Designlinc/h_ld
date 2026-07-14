// api/auth/forgot-password.js
import sql from '../../lib/db.js';
import { requireOrg } from '../../lib/tenant.js';
import { randomBytes } from 'crypto';

const RESET_TTL_MINUTES = 30;
const RESEND_API_KEY = process.env.RESEND_API_KEY;
const MFA_FROM_EMAIL = process.env.MFA_FROM_EMAIL || 'h_ld. <noreply@h-ld.com>';

async function sendResetEmail(email, org, resetUrl) {
  if (!RESEND_API_KEY) {
    console.warn('RESEND_API_KEY not set — password reset link not emailed. Link was:', resetUrl);
    return;
  }
  await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: MFA_FROM_EMAIL,
      to: email,
      subject: 'Reset your h_ld. password',
      html: `<p>We received a request to reset the password for your ${org.name} account.</p>`
        + `<p><a href="${resetUrl}" style="display:inline-block;background:#D84148;color:#fff;text-decoration:none;padding:12px 24px;border-radius:8px;font-weight:600">Reset your password</a></p>`
        + `<p>This link expires in ${RESET_TTL_MINUTES} minutes. If you didn't request this, you can safely ignore this email — your password hasn't been changed.</p>`,
    }),
  });
}

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const org = await requireOrg(req, res);
  if (!org) return;

  const { email } = req.body || {};
  if (!email) return res.status(400).json({ error: 'Email required' });
  const normalizedEmail = email.trim().toLowerCase();

  // Always return the same response whether or not the email exists at
  // this organization — this endpoint must not be usable to check who has
  // an account here, same principle as login's "Invalid credentials".
  const genericResponse = { ok: true, message: 'If an account exists with that email, a reset link has been sent.' };

  const [practitioner] = await sql`
    SELECT id, email FROM practitioners WHERE email = ${normalizedEmail} AND organization_id = ${org.id}
  `;
  if (!practitioner) return res.json(genericResponse);

  const token = randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + RESET_TTL_MINUTES * 60 * 1000);

  await sql`
    INSERT INTO password_resets (token, practitioner_id, expires_at)
    VALUES (${token}, ${practitioner.id}, ${expiresAt})
  `;

  const resetUrl = `https://${org.subdomain}.h-ld.com/?reset_token=${token}`;
  await sendResetEmail(practitioner.email, org, resetUrl).catch(e => console.warn('Reset email failed:', e.message));

  return res.json(genericResponse);
}
