// api/auth/login.js
import sql from '../../lib/db.js';
import { signToken } from '../../lib/auth.js';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';

const MFA_CODE_TTL_MINUTES = 10;
const RESEND_API_KEY = process.env.RESEND_API_KEY;
// TODO: set this to a sender address on a domain verified in your Resend account
const MFA_FROM_EMAIL = process.env.MFA_FROM_EMAIL || 'Solful <noreply@yourdomain.com>';

function generateCode() {
  // Cryptographically random 6-digit code, zero-padded (e.g. "004821")
  return String(crypto.randomInt(0, 1000000)).padStart(6, '0');
}

async function sendMfaEmail(email, code) {
  if (!RESEND_API_KEY) {
    // Fails safe in case the env var isn't set yet — logs instead of silently
    // losing the code, so login isn't a dead end during setup/testing.
    console.warn('RESEND_API_KEY not set — MFA code not emailed. Code was:', code);
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
      subject: 'Your Solful login code',
      html: `<p>Your login security code is:</p>`
        + `<h2 style="letter-spacing:4px">${code}</h2>`
        + `<p>This code expires in ${MFA_CODE_TTL_MINUTES} minutes. If you didn't request this, you can ignore this email.</p>`,
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

  // ── Step: resend a fresh code (user already passed the password step) ──
  if (resend) {
    const [user] = await sql`SELECT id FROM admin_users WHERE email = ${email}`;
    if (!user) return res.status(401).json({ error: 'Invalid request' });
    await issueCode(email);
    return res.json({ ok: true });
  }

  // ── Step: verify the submitted 6-digit code ──
  if (code) {
    const [record] = await sql`SELECT * FROM mfa_codes WHERE email = ${email}`;
    if (!record || record.code !== code) {
      return res.status(401).json({ error: 'Invalid or expired code' });
    }
    if (new Date(record.expires_at) < new Date()) {
      await sql`DELETE FROM mfa_codes WHERE email = ${email}`;
      return res.status(401).json({ error: 'Invalid or expired code' });
    }

    const [user] = await sql`SELECT * FROM admin_users WHERE email = ${email}`;
    if (!user) return res.status(401).json({ error: 'Invalid or expired code' });

    await sql`DELETE FROM mfa_codes WHERE email = ${email}`; // one-time use

    const token = signToken({ id: user.id, email: user.email });
    return res.json({ token, email: user.email });
  }

  // ── Step: initial password check (unchanged from before) ──
  if (!password) return res.status(400).json({ error: 'Email and password required' });

  const [user] = await sql`SELECT * FROM admin_users WHERE email = ${email}`;
  if (!user) return res.status(401).json({ error: 'Invalid credentials' });

  const valid = await bcrypt.compare(password, user.password);
  if (!valid) return res.status(401).json({ error: 'Invalid credentials' });

  // Password correct — instead of issuing a token immediately, send the MFA
  // code and tell the client to move to the verification step.
  await issueCode(email);
  return res.json({ mfaRequired: true });
}
