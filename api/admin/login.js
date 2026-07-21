// api/admin/login.js — super-admin login (password + MFA email code)
import sql from '../../lib/db.js';
import { signToken } from '../../lib/auth.js';
import { renderEmail, codeBlockHtml } from '../../lib/emailTemplate.js';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';

const MFA_CODE_TTL_MINUTES = 10;
const RESEND_API_KEY = process.env.RESEND_API_KEY;
const MFA_FROM_EMAIL = process.env.MFA_FROM_EMAIL || 'h_ld. <noreply@h-ld.com>';

function generateCode() {
  return String(crypto.randomInt(0, 1000000)).padStart(6, '0');
}

async function sendMfaEmail(email, code) {
  if (!RESEND_API_KEY) {
    console.warn('RESEND_API_KEY not set — admin MFA code not emailed. Code was:', code);
    return;
  }
  await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: MFA_FROM_EMAIL,
      to: email,
      subject: 'Your h_ld. super-admin login code',
      html: renderEmail({ bodyHtml: codeBlockHtml(code, MFA_CODE_TTL_MINUTES) }),
    }),
  });
}

async function issueCode(email) {
  const code = generateCode();
  const expiresAt = new Date(Date.now() + MFA_CODE_TTL_MINUTES * 60 * 1000);
  await sql`
    INSERT INTO mfa_codes (email, code, expires_at)
    VALUES (${email}, ${code}, ${expiresAt})
    ON CONFLICT (email) DO UPDATE SET code = EXCLUDED.code, expires_at = EXCLUDED.expires_at
  `;
  await sendMfaEmail(email, code);
}

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { email, password, code, resend } = req.body || {};
  if (!email) return res.status(400).json({ error: 'Email required' });
  const normalizedEmail = email.trim().toLowerCase();

  if (resend) {
    const [admin] = await sql`SELECT id FROM super_admins WHERE email = ${normalizedEmail}`;
    if (!admin) return res.status(401).json({ error: 'Invalid request' });
    await issueCode(normalizedEmail);
    return res.json({ ok: true });
  }

  if (code) {
    const [record] = await sql`SELECT * FROM mfa_codes WHERE email = ${normalizedEmail}`;
    if (!record || record.code !== code) return res.status(401).json({ error: 'Invalid or expired code' });
    if (new Date(record.expires_at) < new Date()) {
      await sql`DELETE FROM mfa_codes WHERE email = ${normalizedEmail}`;
      return res.status(401).json({ error: 'Invalid or expired code' });
    }
    const [admin] = await sql`SELECT * FROM super_admins WHERE email = ${normalizedEmail}`;
    if (!admin) return res.status(401).json({ error: 'Invalid or expired code' });
    await sql`DELETE FROM mfa_codes WHERE email = ${normalizedEmail}`;

    // Shorter-lived than a practitioner session (12h vs 30d) — this login
    // reaches every organization, so it deserves a tighter leash.
    const token = signToken({ super_admin_id: admin.id, role: 'super_admin', email: admin.email }, { expiresIn: '12h' });
    return res.json({ token, email: admin.email });
  }

  if (!password) return res.status(400).json({ error: 'Email and password required' });
  const [admin] = await sql`SELECT * FROM super_admins WHERE email = ${normalizedEmail}`;
  if (!admin) return res.status(401).json({ error: 'Invalid credentials' });
  const valid = await bcrypt.compare(password, admin.password);
  if (!valid) return res.status(401).json({ error: 'Invalid credentials' });

  await issueCode(normalizedEmail);
  return res.json({ mfaRequired: true });
}
