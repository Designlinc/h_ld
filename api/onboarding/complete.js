// api/onboarding/complete.js — marks the onboarding wizard as done for the
// authenticated practitioner, so it never shows again on subsequent logins.
import sql from '../../lib/db.js';
import { requireAuth } from '../../lib/auth.js';
import { requireOrg } from '../../lib/tenant.js';

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const org = await requireOrg(req, res);
  if (!org) return;
  const auth = requireAuth(req, res, org);
  if (!auth) return;

  await sql`UPDATE practitioners SET onboarding_completed = TRUE WHERE id = ${auth.practitioner_id}`;
  return res.json({ ok: true });
}
