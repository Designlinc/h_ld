// api/auth/check-subdomain.js — lightweight public availability check, used
// by the signup form to validate a subdomain live as the practitioner types
// (or edits the one auto-suggested from their business name), without
// needing to actually attempt a signup just to find out it's taken.
import sql from '../../lib/db.js';

const RESERVED_SUBDOMAINS = new Set(['www', 'app', 'admin', 'api', 'book', 'mail', 'support']);
const SUBDOMAIN_PATTERN = /^[a-z0-9-]{3,63}$/;

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const subdomain = (req.query.subdomain || '').trim().toLowerCase();

  if (!SUBDOMAIN_PATTERN.test(subdomain)) {
    return res.json({ available: false, reason: 'Must be 3-63 characters — lowercase letters, numbers, and hyphens only' });
  }
  if (RESERVED_SUBDOMAINS.has(subdomain)) {
    return res.json({ available: false, reason: 'That subdomain is reserved' });
  }

  const [existing] = await sql`SELECT id FROM organizations WHERE subdomain = ${subdomain}`;
  return res.json({ available: !existing, reason: existing ? 'Already taken' : null });
}
