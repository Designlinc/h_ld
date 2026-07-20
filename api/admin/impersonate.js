// api/admin/impersonate.js — start/end a support impersonation session
import sql from '../../lib/db.js';
import { requireSuperAdmin, signToken, verifyToken } from '../../lib/auth.js';

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') return res.status(200).end();

  if (req.method === 'POST') {
    const auth = requireSuperAdmin(req, res);
    if (!auth) return;

    let { organizationId, reason } = req.body || {};
    const { requestId } = req.body || {};

    // Starting from an approved consent request — verify it's actually
    // approved (not pending/denied/expired/already-used) and consume it
    // immediately so the same approval can't be replayed to open a
    // second session later.
    if (requestId) {
      const [request] = await sql`SELECT * FROM impersonation_requests WHERE id = ${requestId}`;
      if (!request) return res.status(404).json({ error: 'Request not found' });
      if (request.status !== 'approved') {
        return res.status(400).json({ error: 'This request has not been approved yet' });
      }
      organizationId = request.organization_id;
      reason = request.reason;
      await sql`UPDATE impersonation_requests SET status = 'used' WHERE id = ${requestId}`;
    }

    if (!organizationId) return res.status(400).json({ error: 'organizationId or requestId required' });

    const [org] = await sql`SELECT id, subdomain, name FROM organizations WHERE id = ${organizationId}`;
    if (!org) return res.status(404).json({ error: 'Organization not found' });

    // Impersonates the org's original (owner) practitioner — solo today,
    // but this is the sensible default even once a clinic has several
    // staff: support sees what the account owner sees.
    const [practitioner] = await sql`
      SELECT id, role FROM practitioners WHERE organization_id = ${organizationId} ORDER BY created_at ASC LIMIT 1
    `;
    if (!practitioner) return res.status(400).json({ error: 'This organization has no practitioners to impersonate' });

    const [logRow] = await sql`
      INSERT INTO impersonation_log (super_admin_id, organization_id, reason, started_at)
      VALUES (${auth.super_admin_id}, ${organizationId}, ${reason || null}, NOW())
      RETURNING id
    `;

    // Short-lived (1h, vs a practitioner's normal 30 days) — a support
    // session shouldn't quietly linger valid for weeks.
    const token = signToken({
      practitioner_id: practitioner.id,
      organization_id: organizationId,
      organization_name: org.name,
      role: practitioner.role,
      impersonating: true,
      super_admin_id: auth.super_admin_id,
      impersonation_log_id: logRow.id,
    }, { expiresIn: '1h' });

    return res.json({ token, organization: { subdomain: org.subdomain, name: org.name } });
  }

  if (req.method === 'DELETE') {
    // Called with the IMPERSONATION token itself in the Authorization
    // header (from the practitioner-view session's "End impersonation"
    // button) — not a super-admin token. That's deliberate: this endpoint
    // just needs to confirm the caller genuinely holds a live
    // impersonation session and close its own audit log entry.
    const authHeader = req.headers.authorization || '';
    const rawToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
    const payload = rawToken ? verifyToken(rawToken) : null;
    if (!payload || !payload.impersonating) {
      return res.status(400).json({ error: 'Not an impersonation session' });
    }
    await sql`UPDATE impersonation_log SET ended_at = NOW() WHERE id = ${payload.impersonation_log_id}`;
    return res.json({ ok: true });
  }

  res.status(405).json({ error: 'Method not allowed' });
}
