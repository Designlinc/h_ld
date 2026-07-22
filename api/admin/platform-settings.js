// api/admin/platform-settings.js — key/value store for super-admin
// controlled, app-wide settings (not scoped to any organization). Currently
// just the login screen background (gradient or image), but shaped the
// same way as the per-org settings table so it's easy to add more keys
// later without a schema change.
//
// GET is deliberately public — admin.html's login screen has to read the
// background config before anyone has signed in, from any tenant
// subdomain, so it can't require a super-admin token. There's nothing
// sensitive in here (colours, a public image URL), so that's fine.
import sql from '../../lib/db.js';
import { requireSuperAdmin } from '../../lib/auth.js';

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') return res.status(200).end();

  if (req.method === 'GET') {
    const { key } = req.query;
    if (key) {
      const [row] = await sql`SELECT value FROM platform_settings WHERE key = ${key}`;
      return res.json(row ? row.value : null);
    }
    const rows = await sql`SELECT key, value FROM platform_settings`;
    const obj = {};
    rows.forEach(r => { obj[r.key] = r.value; });
    return res.json(obj);
  }

  // Everything else changes shared, app-wide config — super-admin only.
  const auth = requireSuperAdmin(req, res);
  if (!auth) return;

  if (req.method === 'POST' || req.method === 'PUT') {
    const { key, value } = req.body || {};
    if (!key) return res.status(400).json({ error: 'key required' });
    await sql`
      INSERT INTO platform_settings (key, value, updated_at)
      VALUES (${key}, ${JSON.stringify(value)}, NOW())
      ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()
    `;
    return res.json({ ok: true });
  }

  res.status(405).json({ error: 'Method not allowed' });
}
