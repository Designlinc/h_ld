// api/admin/organizations.js — list all organizations + suspend/reactivate
import sql from '../../lib/db.js';
import { requireSuperAdmin } from '../../lib/auth.js';

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') return res.status(200).end();

  const auth = requireSuperAdmin(req, res);
  if (!auth) return;

  if (req.method === 'GET') {
    const rows = await sql`
      SELECT
        o.id, o.subdomain, o.name, o.plan_tier, o.billing_status, o.stripe_status, o.created_at,
        COUNT(DISTINCT p.id) AS practitioner_count,
        MIN(p.email) AS owner_email,
        COUNT(DISTINCT CASE WHEN ot.provider = 'google' THEN ot.practitioner_id END) AS google_connected,
        COUNT(DISTINCT CASE WHEN ot.provider = 'square' THEN ot.practitioner_id END) AS square_connected
      FROM organizations o
      LEFT JOIN practitioners p ON p.organization_id = o.id
      LEFT JOIN oauth_tokens ot ON ot.practitioner_id = p.id
      GROUP BY o.id
      ORDER BY o.created_at DESC
    `;
    return res.json({ organizations: rows });
  }

  if (req.method === 'PATCH') {
    // Deliberately only these two values — 'trial' is set by signup and
    // 'cancelled' is set by the billing cancel flow / Stripe webhook.
    // Manually forcing either of those from here would desync this from
    // what Stripe actually thinks is happening.
    const { organizationId, billingStatus } = req.body || {};
    if (!organizationId || !['active', 'suspended'].includes(billingStatus)) {
      return res.status(400).json({ error: "organizationId and a billingStatus of 'active' or 'suspended' are required" });
    }
    await sql`UPDATE organizations SET billing_status = ${billingStatus} WHERE id = ${organizationId}`;
    return res.json({ ok: true });
  }

  res.status(405).json({ error: 'Method not allowed' });
}
