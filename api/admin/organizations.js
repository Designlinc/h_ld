// api/admin/organizations.js — list, detail view, suspend/reactivate, subdomain change, remove
import sql from '../../lib/db.js';
import { requireSuperAdmin } from '../../lib/auth.js';
import { invalidateOrgCache } from '../../lib/tenant.js';
import { requireStripe } from '../../lib/stripe.js';

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

  if (req.method === 'DELETE') {
    const { organizationIds } = req.body || {};
    if (!Array.isArray(organizationIds) || !organizationIds.length) {
      return res.status(400).json({ error: 'organizationIds array required' });
    }

    // Server-side safety guardrail, independent of whatever the frontend
    // sends: this endpoint can only ever remove organizations that are
    // genuinely still 'pending' (never completed signup/payment) — never
    // active, trial, suspended, or cancelled accounts, which may have real
    // client data. Refuses the entire batch rather than silently skipping
    // anything that doesn't qualify, so a bug elsewhere can't accidentally
    // widen what this is capable of deleting.
    const rows = await sql`SELECT id, subdomain, billing_status FROM organizations WHERE id = ANY(${organizationIds})`;
    const notPending = rows.filter(r => r.billing_status !== 'pending');
    if (notPending.length) {
      return res.status(400).json({ error: `Refusing to delete — ${notPending.length} of the selected organizations are not pending (this tool only removes abandoned signups that never completed setup)` });
    }
    if (rows.length !== organizationIds.length) {
      return res.status(404).json({ error: 'One or more organizations were not found' });
    }

    // ON DELETE CASCADE on every dependent table handles cleanup of
    // practitioners, bookings, clients, etc. automatically — a genuinely
    // pending org shouldn't have any of these anyway, since requireOrg()
    // blocks pending orgs from the API entirely, but this is safe either way.
    await sql`DELETE FROM organizations WHERE id = ANY(${organizationIds})`;
    rows.forEach(r => invalidateOrgCache(r.subdomain));
    return res.json({ ok: true, deleted: organizationIds.length });
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
      // 'trial' is set by signup and shouldn't be forced from here.
      // 'cancelled' needs to actually cancel the real Stripe subscription
      // first (same as the customer-facing cancel flow) — writing
      // 'cancelled' straight to the database without that would leave a
      // real subscription still running and still billing them, just with
      // h_ld's own records no longer reflecting reality.
      if (billingStatus === 'cancelled') {
        const [orgRow] = await sql`SELECT stripe_subscription_id FROM organizations WHERE id = ${organizationId}`;
        if (orgRow?.stripe_subscription_id) {
          const stripe = requireStripe(res);
          if (!stripe) return; // requireStripe already sent the error response
          try {
            await stripe.subscriptions.cancel(orgRow.stripe_subscription_id);
          } catch (err) {
            // Already cancelled or otherwise gone on Stripe's side is fine
            // to proceed past — anything else is a real failure worth
            // stopping for rather than silently marking cancelled anyway.
            if (err.code !== 'resource_missing') {
              return res.status(502).json({ error: 'Could not cancel the Stripe subscription: ' + err.message });
            }
          }
        }
        await sql`UPDATE organizations SET billing_status = 'cancelled' WHERE id = ${organizationId}`;
      } else if (['active', 'suspended'].includes(billingStatus)) {
        await sql`UPDATE organizations SET billing_status = ${billingStatus} WHERE id = ${organizationId}`;
      } else {
        return res.status(400).json({ error: "billingStatus must be 'active', 'suspended', or 'cancelled'" });
      }
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
