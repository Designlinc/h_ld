// api/auth/verify-email.js — clicked from the "Confirm your account" button
// in the signup confirmation email. GET request (it's a link, not a form
// submission), so success redirects straight into the app rather than
// returning JSON — reuses the exact same signup_token mechanism admin.html
// already knows how to consume (see the _bootSignupToken handling there),
// so no frontend changes were needed for the success path.
import sql from '../../lib/db.js';
import { signToken } from '../../lib/auth.js';

const ROOT_DOMAIN = process.env.ROOT_DOMAIN || 'h-ld.com';

// A minimal, self-contained error page — deliberately not dependent on
// any other page's state, since this is reached directly from an email
// link that could be clicked hours or days after signup, in a browser
// tab with no other context loaded.
function errorPage(res, title, message) {
  res.setHeader('Content-Type', 'text/html');
  return res.status(400).send(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>${title}</title>
<style>body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;background:#FEEEE1;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;padding:24px}
.card{background:#fff;border-radius:16px;padding:40px 32px;max-width:420px;text-align:center;box-shadow:0 4px 24px rgba(0,0,0,.08)}
h1{font-size:18px;margin:0 0 12px;color:#1A1A1A}p{font-size:14px;color:#6F6F71;line-height:1.6;margin:0 0 20px}
a{display:inline-block;background:#1A1A1A;color:#fff;text-decoration:none;padding:12px 24px;border-radius:8px;font-weight:700;font-size:14px}</style>
</head><body><div class="card"><h1>${title}</h1><p>${message}</p><a href="https://${ROOT_DOMAIN}">Go to h_ld.</a></div></body></html>`);
}

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).end();

  const { token } = req.query;
  if (!token) return errorPage(res, 'Invalid link', 'This confirmation link is missing its token — please use the link from your email exactly as sent.');

  const [practitioner] = await sql`
    SELECT id, organization_id, role, email, email_verified, email_verify_token_expires
    FROM practitioners WHERE email_verify_token = ${token}
  `;

  if (!practitioner) {
    return errorPage(res, 'Link already used', 'This confirmation link has already been used or is no longer valid. If your account is already active, just log in normally.');
  }
  if (practitioner.email_verify_token_expires && new Date(practitioner.email_verify_token_expires) < new Date()) {
    return errorPage(res, 'Link expired', 'This confirmation link has expired. Log in with your email and password — you\u2019ll be offered a way to resend a fresh confirmation email from there.');
  }

  const [org] = await sql`SELECT subdomain FROM organizations WHERE id = ${practitioner.organization_id}`;
  if (!org) {
    return errorPage(res, 'Something went wrong', 'We couldn\u2019t find the account this link belongs to. Please contact support.');
  }

  await sql`
    UPDATE practitioners
    SET email_verified = TRUE, email_verify_token = NULL, email_verify_token_expires = NULL
    WHERE id = ${practitioner.id}
  `;

  // Fresh token carrying the now-verified state — the one issued at
  // signup still says email_verified: false and would otherwise keep
  // getting blocked by requireAuth() even after this succeeds.
  const freshToken = signToken({
    practitioner_id: practitioner.id,
    organization_id: practitioner.organization_id,
    role: practitioner.role,
    email: practitioner.email,
    email_verified: true,
  });

  res.writeHead(302, { Location: `https://${org.subdomain}.${ROOT_DOMAIN}/admin.html?signup_token=${freshToken}` });
  return res.end();
}
