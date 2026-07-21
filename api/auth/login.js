// api/auth/login.js
import sql from '../../lib/db.js';
import { signToken } from '../../lib/auth.js';
import { requireOrg } from '../../lib/tenant.js';
import { renderEmail, codeBlockHtml } from '../../lib/emailTemplate.js';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';

const MFA_CODE_TTL_MINUTES = 10;
const RESEND_API_KEY = process.env.RESEND_API_KEY;
const MFA_FROM_EMAIL = process.env.MFA_FROM_EMAIL || 'h_ld. <noreply@h-ld.com>';

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
      subject: 'Your h_ld. login code',
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

  // Every login happens in the context of one organization, resolved from
  // the subdomain being visited (sarah.h-ld.com) — never from anything the
  // client sends in the request body. requireOrg() writes the 404/403
  // response itself if there's no org here.
  const org = await requireOrg(req, res);
  if (!org) return;

  const { email, password, code, resend } = req.body || {};
  if (!email) return res.status(400).json({ error: 'Email required' });
  const normalizedEmail = email.trim().toLowerCase();

  // ── Step: resend a fresh code (user already passed the password step) ──
  if (resend) {
    const [practitioner] = await sql`
      SELECT id FROM practitioners WHERE email = ${normalizedEmail} AND organization_id = ${org.id}
    `;
    if (!practitioner) return res.status(401).json({ error: 'Invalid request' });
    await issueCode(normalizedEmail);
    return res.json({ ok: true });
  }

  // ── Step: verify the submitted 6-digit code ──
  if (code) {
    const [record] = await sql`SELECT * FROM mfa_codes WHERE email = ${normalizedEmail}`;
    if (!record || record.code !== code) {
      return res.status(401).json({ error: 'Invalid or expired code' });
    }
    if (new Date(record.expires_at) < new Date()) {
      await sql`DELETE FROM mfa_codes WHERE email = ${normalizedEmail}`;
      return res.status(401).json({ error: 'Invalid or expired code' });
    }

    const [practitioner] = await sql`
      SELECT * FROM practitioners WHERE email = ${normalizedEmail} AND organization_id = ${org.id}
    `;
    if (!practitioner) return res.status(401).json({ error: 'Invalid or expired code' });

    await sql`DELETE FROM mfa_codes WHERE email = ${normalizedEmail}`; // one-time use

    const token = signToken({
      practitioner_id: practitioner.id,
      organization_id: org.id,
      role: practitioner.role,
      email: practitioner.email,
    });
    return res.json({
      token,
      email: practitioner.email,
      role: practitioner.role,
      organization: { id: org.id, name: org.name, subdomain: org.subdomain },
    });
  }

  // ── Step: initial password check ──
  if (!password) return res.status(400).json({ error: 'Email and password required' });

  const [practitioner] = await sql`
    SELECT * FROM practitioners WHERE email = ${normalizedEmail} AND organization_id = ${org.id}
  `;
  // Same "invalid credentials" message whether the email doesn't exist at
  // all or belongs to a practitioner at a *different* organization — don't
  // let this endpoint be used to check which subdomain an email belongs to.
  if (!practitioner) return res.status(401).json({ error: 'Invalid credentials' });

  const valid = await bcrypt.compare(password, practitioner.password);
  if (!valid) return res.status(401).json({ error: 'Invalid credentials' });

  // Password correct — instead of issuing a token immediately, send the MFA
  // code and tell the client to move to the verification step.
  await issueCode(normalizedEmail);
  return res.json({ mfaRequired: true });
}
