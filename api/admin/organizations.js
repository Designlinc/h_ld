// api/admin/organizations.js — list, detail view, suspend/reactivate, subdomain change
import sql from '../../lib/db.js';
import { requireSuperAdmin } from '../../lib/auth.js';
import { invalidateOrgCache } from '../../lib/tenant.js';

const RESERVED_SUBDOMAINS = new Set(['www', 'app', 'admin']);
const SUBDOMAIN_PATTERN = /^[a-z0-9-]{3,63}$/;

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') return res.status(200).end();

  const auth = requireSuperAdmin(req, res);
  if (!auth) return;

  if (req.method === 'GET') {
    const { organizationId } = req.query;

    // ── Detail view for one organization, including its practitioners ──
    if (organizationId) {
      const [org] = await sql`SELECT * FROM organizations WHERE id = ${organizationId}`;
      if (!org) return res.status(404).json({ error: 'Organization not found' });

      const practitioners = await sql`
        SELECT p.id, p.email, p.name, p.role, p.notifications_opt_out, p.created_at,
          (SELECT json_agg(ot.provider) FROM oauth_tokens ot WHERE ot.practitioner_id = p.id) AS connected_providers
        FROM practitioners p
        WHERE p.organization_id = ${organizationId}
        ORDER BY p.created_at ASC
      `;

      return res.json({ organization: org, practitioners });
    }

    // ── List view ──
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
    const { organizationId, billingStatus, subdomain } = req.body || {};
    if (!organizationId) return res.status(400).json({ error: 'organizationId required' });
    if (!billingStatus && !subdomain) {
      return res.status(400).json({ error: 'Provide billingStatus and/or subdomain to update' });
    }

    const [existingOrg] = await sql`SELECT subdomain, billing_status FROM organizations WHERE id = ${organizationId}`;
    if (!existingOrg) return res.status(404).json({ error: 'Organization not found' });

    if (billingStatus) {
      // Deliberately only these two values — 'trial' is set by signup and
      // 'cancelled' is set by the billing cancel flow / Stripe webhook.
      // Manually forcing either of those from here would desync this from
      // what Stripe actually thinks is happening. (Restoring access to a
      // cancelled org still goes through 'active' here — the frontend is
      // responsible for making clear that does NOT recreate a real
      // subscription underneath it.)
      if (!['active', 'suspended'].includes(billingStatus)) {
        return res.status(400).json({ error: "billingStatus must be 'active' or 'suspended'" });
      }
      await sql`UPDATE organizations SET billing_status = ${billingStatus} WHERE id = ${organizationId}`;
    }

    if (subdomain) {
      const normalized = subdomain.trim().toLowerCase();
      if (!SUBDOMAIN_PATTERN.test(normalized)) {
        return res.status(400).json({ error: 'Subdomain must be 3-63 characters — lowercase letters, numbers, and hyphens only' });
      }
      if (RESERVED_SUBDOMAINS.has(normalized)) {
        return res.status(400).json({ error: 'That subdomain is reserved' });
      }
      if (normalized !== existingOrg.subdomain) {
        const [taken] = await sql`SELECT id FROM organizations WHERE subdomain = ${normalized} AND id != ${organizationId}`;
        if (taken) return res.status(409).json({ error: 'That subdomain is already taken' });

        try {
          await sql`UPDATE organizations SET subdomain = ${normalized} WHERE id = ${organizationId}`;
        } catch (err) {
          if (err.code === '23505') return res.status(409).json({ error: 'That subdomain is already taken' });
          throw err;
        }
        // The old subdomain is now free and the new one now resolves — a
        // cached lookup for either would otherwise serve stale data for
        // up to the cache's TTL.
        invalidateOrgCache(existingOrg.subdomain);
        invalidateOrgCache(normalized);
      }
    }

    return res.json({ ok: true });
  }

  res.status(405).json({ error: 'Method not allowed' });
}
