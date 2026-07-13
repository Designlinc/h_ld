// api/auth/signup.js — creates a new organization and its first (owner)
// practitioner. Unlike every other route, this one deliberately does NOT
// call requireOrg() — there's no organization yet, that's the whole point.
// It's meant to run on the marketing/root domain (h-ld.com), not a tenant
// subdomain, and hands back a token plus the new subdomain so the frontend
// can redirect straight to sarah.h-ld.com.
import sql from '../../lib/db.js';
import { signToken } from '../../lib/auth.js';
import bcrypt from 'bcryptjs';
import { randomUUID } from 'crypto';

const RESERVED_SUBDOMAINS = new Set(['www', 'app', 'admin']);
const SUBDOMAIN_PATTERN = /^[a-z0-9-]{3,63}$/;

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { subdomain, orgName, name, email, password } = req.body || {};

  if (!subdomain || !orgName || !email || !password) {
    return res.status(400).json({ error: 'Subdomain, organisation name, email, and password are all required' });
  }
  if (password.length < 8) {
    return res.status(400).json({ error: 'Password must be at least 8 characters' });
  }

  const normalizedSubdomain = subdomain.trim().toLowerCase();
  if (!SUBDOMAIN_PATTERN.test(normalizedSubdomain)) {
    return res.status(400).json({ error: 'Subdomain must be 3-63 characters — lowercase letters, numbers, and hyphens only' });
  }
  if (RESERVED_SUBDOMAINS.has(normalizedSubdomain)) {
    return res.status(400).json({ error: 'That subdomain is reserved — please choose another' });
  }

  const normalizedEmail = email.trim().toLowerCase();

  // Friendly pre-checks first (fast, clear error messages)...
  const [existingSubdomain] = await sql`SELECT id FROM organizations WHERE subdomain = ${normalizedSubdomain}`;
  if (existingSubdomain) {
    return res.status(409).json({ error: 'That subdomain is already taken' });
  }
  const [existingEmail] = await sql`SELECT id FROM practitioners WHERE email = ${normalizedEmail}`;
  if (existingEmail) {
    return res.status(409).json({ error: 'An account with that email already exists' });
  }

  const organizationId = randomUUID();
  const practitionerId = randomUUID();
  const passwordHash = await bcrypt.hash(password, 12);

  try {
    // ...and the table's UNIQUE constraints as the real guarantee, in case
    // two signups for the same subdomain/email land in the same instant.
    await sql`
      INSERT INTO organizations (id, subdomain, name, plan_tier, billing_status)
      VALUES (${organizationId}, ${normalizedSubdomain}, ${orgName.trim()}, 'trial', 'trial')
    `;
    await sql`
      INSERT INTO practitioners (id, organization_id, email, password, name, role)
      VALUES (${practitionerId}, ${organizationId}, ${normalizedEmail}, ${passwordHash}, ${name ? name.trim() : null}, 'owner')
    `;
  } catch (err) {
    if (err.code === '23505') { // unique_violation
      return res.status(409).json({ error: 'That subdomain or email was just taken — please try again' });
    }
    console.error('Signup error:', err);
    return res.status(500).json({ error: 'Something went wrong creating your account' });
  }

  // Signed in immediately on signup — no separate login step right after.
  // Their very first *return* login will go through the normal MFA flow.
  const token = signToken({
    practitioner_id: practitionerId,
    organization_id: organizationId,
    role: 'owner',
    email: normalizedEmail,
  });

  return res.status(201).json({
    token,
    organization: { id: organizationId, name: orgName.trim(), subdomain: normalizedSubdomain },
  });
}
