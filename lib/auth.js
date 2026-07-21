// lib/auth.js — JWT helpers + tenant-aware auth middleware
import jwt from 'jsonwebtoken';
import sql from './db.js';

const SECRET = process.env.JWT_SECRET;
const MUTATING_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

export function signToken(payload, options = {}) {
  return jwt.sign(payload, SECRET, { expiresIn: '30d', ...options });
}

export function verifyToken(token) {
  try {
    return jwt.verify(token, SECRET);
  } catch {
    return null;
  }
}

function getBearerToken(req) {
  const auth = req.headers.authorization || '';
  return auth.startsWith('Bearer ') ? auth.slice(7) : null;
}

// Fire-and-forget on purpose — requireAuth is called synchronously from
// every route, and making every one of those an `await` just to log an
// audit entry would be a much bigger, riskier change than this feature
// needs. A logging failure here is worth knowing about (hence the console
// error) but should never be able to block or fail the actual request.
async function logImpersonationAction(impersonationLogId, method, path) {
  if (!impersonationLogId) return;
  try {
    await sql`
      INSERT INTO impersonation_actions (impersonation_log_id, method, path)
      VALUES (${impersonationLogId}, ${method}, ${path})
    `;
  } catch (err) {
    console.error('Failed to log impersonation action:', err.message);
  }
}

// requireAuth — verifies a practitioner's JWT AND checks it belongs to the
// organization this request is for. This is the second half of tenant
// isolation: tenant.js's requireOrg() proves which org the *request* is
// for (from the Host header); this proves the *token* is allowed to act on
// that org. A token issued on sarah.h-ld.com cannot be replayed against a
// different practitioner's subdomain, because organization_id won't match.
//
// Pass in the `org` object already resolved by requireOrg() so this never
// needs its own DB round-trip.
//
// Impersonation tokens (see api/admin/impersonate.js, built in a later
// step) carry `impersonating: true` and skip the org match check by
// design — they're deliberately minted scoped to whatever org a
// super-admin is currently supporting.
export function requireAuth(req, res, org) {
  const token = getBearerToken(req);
  if (!token) {
    res.status(401).json({ error: 'Unauthorised' });
    return null;
  }

  const payload = verifyToken(token);
  if (!payload) {
    res.status(401).json({ error: 'Invalid or expired token' });
    return null;
  }

  if (payload.impersonating) {
    if (MUTATING_METHODS.has(req.method)) {
      logImpersonationAction(payload.impersonation_log_id, req.method, req.url);
    }
    return payload;
  }

  if (org && payload.organization_id !== org.id) {
    res.status(401).json({ error: 'Token does not match this organisation' });
    return null;
  }

  return payload;
}

// requireSuperAdmin — a fully separate credential space from practitioners
// (the super_admins table, not a "role" column on practitioners). This
// matters: it means a bug or forged claim in practitioner auth can never
// grant cross-tenant access, because super-admin tokens are only ever
// issued by a distinct login route reading from a distinct table.
export function requireSuperAdmin(req, res) {
  const token = getBearerToken(req);
  if (!token) {
    res.status(401).json({ error: 'Unauthorised' });
    return null;
  }
  const payload = verifyToken(token);
  if (!payload || payload.role !== 'super_admin') {
    res.status(403).json({ error: 'Super-admin access required' });
    return null;
  }
  return payload;
}
