// api/auth/org-status.js — public, unauthenticated status check for the
// organization at the current subdomain. Called early in admin.html's
// boot sequence so a suspended/cancelled account (or a subdomain with no
// account at all) sees a clear status message immediately, rather than a
// normal-looking login form that only reveals the problem after they've
// tried to actually sign in.
import { resolveOrgFromHost } from '../../lib/tenant.js';

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const org = await resolveOrgFromHost(req);
  if (!org) {
    return res.json({ status: 'not_found' });
  }

  // Deliberately minimal payload — this is public and unauthenticated, no
  // sensitive detail beyond the name (needed for the message) and status.
  return res.json({ status: org.billing_status, orgName: org.name });
}
