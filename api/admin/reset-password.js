// api/admin/reset-password.js — force-set a practitioner's password.
// For the case the forgot-password flow can't cover: someone locked out
// of their email too, not just their password. The temp password is
// returned once in this response for you to relay directly — it is never
// emailed and never logged in plaintext anywhere.
import sql from '../../lib/db.js';
import { requireSuperAdmin } from '../../lib/auth.js';
import bcrypt from 'bcryptjs';
import { randomBytes } from 'crypto';

function generateTempPassword() {
  // 12 random bytes, base64url-encoded, trimmed to a clean 16 characters —
  // easy enough to read aloud over the phone, still strong.
  return randomBytes(12).toString('base64').replace(/[+/=]/g, '').slice(0, 16);
}

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const auth = requireSuperAdmin(req, res);
  if (!auth) return;

  const { practitionerId } = req.body || {};
  if (!practitionerId) return res.status(400).json({ error: 'practitionerId required' });

  const [practitioner] = await sql`SELECT id, email FROM practitioners WHERE id = ${practitionerId}`;
  if (!practitioner) return res.status(404).json({ error: 'Practitioner not found' });

  const tempPassword = generateTempPassword();
  const passwordHash = await bcrypt.hash(tempPassword, 12);
  await sql`UPDATE practitioners SET password = ${passwordHash} WHERE id = ${practitionerId}`;

  return res.json({ ok: true, email: practitioner.email, tempPassword });
}
