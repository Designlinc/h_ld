// api/admin/impersonate-respond.js — practitioner-facing, token-based.
// No login required, same reasoning as the password-reset flow.
import sql from '../../lib/db.js';
import { requireOrg } from '../../lib/tenant.js';

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') return res.status(200).end();

  const org = await requireOrg(req, res);
  if (!org) return;

  if (req.method === 'GET') {
    const { token } = req.query;
    if (!token) return res.status(400).json({ error: 'token required' });

    const [request] = await sql`
      SELECT status, reason, expires_at FROM impersonation_requests
      WHERE token = ${token} AND organization_id = ${org.id}
    `;
    if (!request) return res.status(404).json({ error: 'This link is invalid' });

    if (request.status === 'pending' && new Date(request.expires_at) < new Date()) {
      await sql`UPDATE impersonation_requests SET status = 'expired' WHERE token = ${token}`;
      return res.json({ status: 'expired', reason: request.reason, organizationName: org.name });
    }

    return res.json({ status: request.status, reason: request.reason, organizationName: org.name });
  }

  if (req.method === 'POST') {
    const { token, approve } = req.body || {};
    if (!token || typeof approve !== 'boolean') {
      return res.status(400).json({ error: 'token and approve are required' });
    }

    const [request] = await sql`
      SELECT * FROM impersonation_requests WHERE token = ${token} AND organization_id = ${org.id}
    `;
    if (!request) return res.status(404).json({ error: 'This link is invalid' });
    if (request.status !== 'pending') {
      return res.status(400).json({ error: 'This request has already been responded to' });
    }
    if (new Date(request.expires_at) < new Date()) {
      await sql`UPDATE impersonation_requests SET status = 'expired' WHERE token = ${token}`;
      return res.status(400).json({ error: 'This request has expired' });
    }

    const newStatus = approve ? 'approved' : 'denied';
    await sql`UPDATE impersonation_requests SET status = ${newStatus}, responded_at = NOW() WHERE token = ${token}`;
    return res.json({ ok: true, status: newStatus });
  }

  res.status(405).json({ error: 'Method not allowed' });
}
