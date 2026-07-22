// api/communications/index.js — GET the communications log for this org.
// Writes happen inside notifications/send.js at the moment a message is
// actually sent — this route is read-only, for the dashboard list.
import sql from '../../lib/db.js';
import { requireAuth } from '../../lib/auth.js';
import { requireOrg } from '../../lib/tenant.js';

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') return res.status(200).end();

  const org = await requireOrg(req, res);
  if (!org) return;
  const auth = requireAuth(req, res, org);
  if (!auth) return;
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const rows = await sql`
    SELECT * FROM communications WHERE organization_id = ${org.id} ORDER BY created_at DESC LIMIT 200
  `;
  return res.json(rows);
}
