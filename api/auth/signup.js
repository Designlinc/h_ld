// api/auth/signup.js — creates a new organization and its first (owner)
// practitioner, then immediately starts a Stripe Checkout session — no free
// accounts. The org is created with billing_status 'pending', which
// requireOrg() blocks from actually using the app; the Stripe webhook
// (checkout.session.completed) flips it to 'active' once payment succeeds.
// Separately, the practitioner starts with email_verified false, which
// requireAuth() also blocks on — cleared by clicking the confirmation link
// sent below (see api/auth/verify-email.js). Both gates are independent
// and can clear in either order; real access requires both.
//
// Unlike every other route, this one deliberately does NOT call
// requireOrg() — there's no organization yet, that's the whole point. It's
// meant to run on the marketing/root domain (h-ld.com), not a tenant
// subdomain.
import sql from '../../lib/db.js';
import { signToken } from '../../lib/auth.js';
import { requireStripe } from '../../lib/stripe.js';
import { renderEmail, buttonHtml } from '../../lib/emailTemplate.js';
import bcrypt from 'bcryptjs';
import { randomUUID, randomBytes } from 'crypto';

const RESERVED_SUBDOMAINS = new Set(['www', 'app', 'admin', 'api', 'book', 'mail', 'support']);
const SUBDOMAIN_PATTERN = /^[a-z0-9-]{3,63}$/;
const PRICE_ID = process.env.STRIPE_PRICE_ID;
const RESEND_API_KEY = process.env.RESEND_API_KEY;
const MFA_FROM_EMAIL = process.env.MFA_FROM_EMAIL || 'h_ld. <noreply@h-ld.com>';
const ROOT_DOMAIN = process.env.ROOT_DOMAIN || 'h-ld.com';
const VERIFY_TOKEN_TTL_HOURS = 48;

async function sendConfirmationEmail(email, verifyToken, subdomain) {
  const confirmUrl = `https://${ROOT_DOMAIN}/api/auth/verify-email?token=${verifyToken}`;
  const subdomainUrl = `https://${subdomain}.${ROOT_DOMAIN}/admin.html`;
  const subdomainLabel = `${subdomain}.${ROOT_DOMAIN}/admin.html`;
  const bodyHtml = `
    <p style="margin:0 0 20px;font-size:15px;color:#1A1A1A;line-height:1.6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif">Thanks for signing up! Confirm your email address to activate your account and get started.</p>
    ${buttonHtml(confirmUrl, 'Confirm your account')}
    <p style="margin:28px 0 12px;font-size:13px;color:#1A1A1A;line-height:1.6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif">You can also access your h_ld account via your own subdomain:</p>
    ${buttonHtml(subdomainUrl, subdomainLabel)}
    <p style="margin:20px 0 0;font-size:13px;color:#1A1A1A;line-height:1.6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif">This link expires in ${VERIFY_TOKEN_TTL_HOURS} hours. If you didn't create this account, you can safely ignore this email.</p>
  `;
  if (!RESEND_API_KEY) {
    console.warn('RESEND_API_KEY not set — confirmation email not sent. Link was:', confirmUrl);
    return;
  }
  await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: MFA_FROM_EMAIL,
      to: email,
      subject: 'Confirm your h_ld. account',
      html: renderEmail({ bodyHtml }),
    }),
  });
}

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const stripe = requireStripe(res);
  if (!stripe) return;
  if (!PRICE_ID) return res.status(500).json({ error: 'STRIPE_PRICE_ID not configured' });

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
  const trimmedOrgName = orgName.trim();
  const verifyToken = randomBytes(32).toString('hex');
  const verifyTokenExpires = new Date(Date.now() + VERIFY_TOKEN_TTL_HOURS * 60 * 60 * 1000);

  try {
    // ...and the table's UNIQUE constraints as the real guarantee, in case
    // two signups for the same subdomain/email land in the same instant.
    // billing_status starts 'pending' — deliberately NOT usable yet (see
    // requireOrg in lib/tenant.js) until the checkout below actually completes.
    await sql`
      INSERT INTO organizations (id, subdomain, name, plan_tier, billing_status)
      VALUES (${organizationId}, ${normalizedSubdomain}, ${trimmedOrgName}, 'standard', 'pending')
    `;
    await sql`
      INSERT INTO practitioners (id, organization_id, email, password, name, role, email_verify_token, email_verify_token_expires)
      VALUES (${practitionerId}, ${organizationId}, ${normalizedEmail}, ${passwordHash}, ${name ? name.trim() : null}, 'owner', ${verifyToken}, ${verifyTokenExpires})
    `;
    // Seed Settings with what was already collected here, so the practitioner
    // lands on their real business name instead of the generic "Your
    // Business" placeholder the first time they open Settings.
    await sql`
      INSERT INTO settings (organization_id, key, value, updated_at)
      VALUES (${organizationId}, 'app_settings', ${JSON.stringify({ bizName: trimmedOrgName, pracName: name ? name.trim() : '', email: normalizedEmail })}, NOW())
    `;
  } catch (err) {
    if (err.code === '23505') { // unique_violation
      return res.status(409).json({ error: 'That subdomain or email was just taken — please try again' });
    }
    console.error('Signup error:', err);
    return res.status(500).json({ error: 'Something went wrong creating your account' });
  }

  // Confirmation email goes out now, alongside payment — the two gates
  // (billing_status via requireOrg, email_verified via requireAuth) are
  // independent and can complete in either order.
  await sendConfirmationEmail(normalizedEmail, verifyToken, normalizedSubdomain);

  // Handed back now so the post-checkout redirect can carry it straight into
  // the app — it identifies who they are, but is useless for actually doing
  // anything until billing_status flips to 'active' AND the email is
  // confirmed, since every API route goes through requireOrg() and
  // requireAuth() first.
  const token = signToken({
    practitioner_id: practitionerId,
    organization_id: organizationId,
    role: 'owner',
    email: normalizedEmail,
    email_verified: false,
  });

  let session;
  try {
    const customer = await stripe.customers.create({
      name: trimmedOrgName,
      email: normalizedEmail,
      metadata: { organization_id: organizationId },
    });
    await sql`UPDATE organizations SET stripe_customer_id = ${customer.id} WHERE id = ${organizationId}`;

    session = await stripe.checkout.sessions.create({
      customer: customer.id,
      mode: 'subscription',
      line_items: [{ price: PRICE_ID, quantity: 1 }],
      success_url: `https://${normalizedSubdomain}.h-ld.com/admin.html?signup_token=${token}&billing=success`,
      cancel_url: `https://h-ld.com/signup.html?billing=cancelled`,
      metadata: { organization_id: organizationId, subdomain: normalizedSubdomain },
    });
  } catch (err) {
    // The account row already exists at this point (billing_status
    // 'pending', so it can't be used) — safe to leave it and let them retry
    // rather than unwinding the insert, which risks a partial-failure state
    // that's harder to reason about than an inert unpaid row.
    console.error('Stripe checkout creation failed during signup:', err.message);
    return res.status(500).json({ error: 'Could not start checkout — please try again' });
  }

  return res.status(201).json({
    checkoutUrl: session.url,
    organization: { id: organizationId, name: trimmedOrgName, subdomain: normalizedSubdomain },
  });
}
