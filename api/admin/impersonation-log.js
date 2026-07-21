// api/admin/impersonation-log.js — view past impersonation sessions and
// the actions taken during them.
import sql from '../../lib/db.js';
import { requireSuperAdmin } from '../../lib/auth.js';

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const auth = requireSuperAdmin(req, res);
  if (!auth) return;

  const { organizationId, logId } = req.query;

  // ── Actions taken during one specific session ──
  if (logId) {
    const actions = await sql`
      SELECT method, path, created_at FROM impersonation_actions
      WHERE impersonation_log_id = ${logId}
      ORDER BY created_at ASC
    `;
    return res.json({ actions });
  }

  // ── List of past sessions for an org, with an action count each ──
  if (organizationId) {
    const sessions = await sql`
      SELECT
        il.id, il.reason, il.started_at, il.ended_at,
        sa.email AS super_admin_email,
        COUNT(ia.id) AS action_count
      FROM impersonation_log il
      LEFT JOIN super_admins sa ON sa.id = il.super_admin_id
      LEFT JOIN impersonation_actions ia ON ia.impersonation_log_id = il.id
      WHERE il.organization_id = ${organizationId}
      GROUP BY il.id, sa.email
      ORDER BY il.started_at DESC
    `;
    return res.json({ sessions });
  }

  return res.status(400).json({ error: 'organizationId or logId required' });
}
