// lib/tenant.js — resolves which organization a request belongs to.
//
// This is the core of tenant isolation. It works without any Next.js-style
// middleware because this app is plain Vercel serverless functions — every
// function already receives the real Host header on every request, and
// since the frontend's API_BASE is a relative path ('/api'), a browser on
// sarah.h-ld.com automatically sends that host on every fetch(). No routing
// logic needs to live in the frontend at all.
import sql from './db.js';

const ROOT_DOMAIN = process.env.ROOT_DOMAIN || 'h-ld.com';

// Reserved subdomains that are never tenant subdomains — marketing site,
// the app shell (if ever split out), and a future dedicated super-admin host.
const RESERVED = new Set(['www', 'app', 'admin']);

// Warm serverless instances can stay alive for several minutes; caching the
// org lookup avoids a DB round-trip on every single request without needing
// external cache infra. TTL is short on purpose — an org's subdomain
// essentially never changes, but billing_status (suspension) should take
// effect quickly, not sit stale for minutes.
const CACHE_TTL_MS = 30_000;
const cache = new Map(); // subdomain -> { org, expires }

function extractSubdomain(host) {
  if (!host) return null;
  const hostname = host.split(':')[0].toLowerCase();

  // Local dev and Vercel preview URLs (*.vercel.app) don't carry a real
  // subdomain of ROOT_DOMAIN — callers fall back to DEV_ORG_SUBDOMAIN below.
  if (hostname === 'localhost' || hostname.endsWith('.vercel.app')) return null;
  if (!hostname.endsWith('.' + ROOT_DOMAIN)) return null;

  const sub = hostname.slice(0, -(ROOT_DOMAIN.length + 1));
  if (!sub || RESERVED.has(sub)) return null;
  return sub;
}

// resolveOrgFromHost — returns the organization row for this request's
// host, or null if none matches. Does NOT reject suspended orgs — callers
// that need that check should use requireOrg() instead, since a couple of
// routes (e.g. a "this account is paused" landing page) legitimately want
// to resolve a suspended org rather than get a blanket 404.
export async function resolveOrgFromHost(req) {
  let subdomain = extractSubdomain(req.headers.host);

  // Local dev fallback — lets `vercel dev` work without wildcard DNS.
  if (!subdomain && process.env.DEV_ORG_SUBDOMAIN) {
    subdomain = process.env.DEV_ORG_SUBDOMAIN;
  }
  if (!subdomain) return null;

  const cached = cache.get(subdomain);
  if (cached && cached.expires > Date.now()) return cached.org;

  const [org] = await sql`
    SELECT id, subdomain, name, plan_tier, billing_status
    FROM organizations
    WHERE subdomain = ${subdomain}
  `;

  if (org) cache.set(subdomain, { org, expires: Date.now() + CACHE_TTL_MS });
  return org || null;
}

// requireOrg — the version most API routes should call. Resolves the org
// and rejects the request outright if there isn't one, or if the org is
// suspended. Writes the response itself (404 / 403) so callers just need to
// check for a falsy return, matching the existing requireAuth() pattern.
export async function requireOrg(req, res) {
  const org = await resolveOrgFromHost(req);
  if (!org) {
    res.status(404).json({ error: 'No organisation found for this domain' });
    return null;
  }
  if (org.billing_status === 'suspended' || org.billing_status === 'cancelled') {
    res.status(403).json({ error: org.billing_status === 'cancelled' ? 'This subscription has been cancelled' : 'This account is currently suspended' });
    return null;
  }
  return org;
}

// Call after any write that changes an org's subdomain or billing_status
// (e.g. super-admin suspending an account) so the cache doesn't serve a
// stale row for up to CACHE_TTL_MS.
export function invalidateOrgCache(subdomain) {
  cache.delete(subdomain);
}
