// api/auth/reset-password.js
import sql from '../../lib/db.js';
import { requireOrg } from '../../lib/tenant.js';
import bcrypt from 'bcryptjs';

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const org = await requireOrg(req, res);
  if (!org) return;

  const { token, password } = req.body || {};
  if (!token || !password) return res.status(400).json({ error: 'Token and new password required' });
  if (password.length < 8) return res.status(400).json({ error: 'Password must be at least 8 characters' });

  const [record] = await sql`SELECT * FROM password_resets WHERE token = ${token}`;
  if (!record || new Date(record.expires_at) < new Date()) {
    if (record) await sql`DELETE FROM password_resets WHERE token = ${token}`;
    return res.status(401).json({ error: 'This reset link is invalid or has expired — request a new one.' });
  }

  // Confirm the practitioner this token belongs to is actually a member of
  // the organization this request is for — a token generated on one
  // subdomain shouldn't be usable to reset a password via a different one.
  const [practitioner] = await sql`
    SELECT id FROM practitioners WHERE id = ${record.practitioner_id} AND organization_id = ${org.id}
  `;
  if (!practitioner) {
    await sql`DELETE FROM password_resets WHERE token = ${token}`;
    return res.status(401).json({ error: 'This reset link is invalid or has expired — request a new one.' });
  }

  const passwordHash = await bcrypt.hash(password, 12);
  await sql`UPDATE practitioners SET password = ${passwordHash} WHERE id = ${practitioner.id}`;

  // One-time use — delete immediately after a successful reset.
  await sql`DELETE FROM password_resets WHERE token = ${token}`;

  return res.json({ ok: true });
}
