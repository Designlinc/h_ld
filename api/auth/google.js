// api/auth/google.js — Google OAuth (initiate + callback combined)
// GET (with Authorization header, no code param) → returns { url } to redirect to
// GET ?code=... / ?error=...                     → callback from Google, no auth possible here
import sql from '../../lib/db.js';
import { requireAuth, signToken, verifyToken } from '../../lib/auth.js';
import { requireOrg } from '../../lib/tenant.js';

// Google requires an exact, pre-registered redirect URI — it cannot be a
// wildcard covering every practitioner's subdomain, so the callback always
// lands on one fixed URL regardless of which org initiated the flow.
// Identity is recovered from the signed `state` param instead of the Host
// header, which is why this route doesn't call requireOrg() in the
// callback branch below.
const REDIRECT_URI = process.env.GOOGLE_REDIRECT_URI;

export default async function handler(req, res) {
  const { code, error, state } = req.query;

  // ── Callback from Google — no Authorization header is possible here,
  // this is a plain browser redirect Google issued, not a fetch call. ──
  if (code || error) {
    if (error || !code) return res.redirect('https://h-ld.com/?cal_error=1');

    const decoded = verifyToken(state);
    if (!decoded || decoded.purpose !== 'google_oauth') {
      return res.redirect('https://h-ld.com/?cal_error=1');
    }
    const { practitioner_id: practitionerId, subdomain } = decoded;
    const failRedirect = `https://${subdomain}.h-ld.com/admin.html?cal_error=1`;

    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id:     process.env.GOOGLE_CLIENT_ID,
        client_secret: process.env.GOOGLE_CLIENT_SECRET,
        redirect_uri:  REDIRECT_URI,
        grant_type:    'authorization_code',
      }),
    });

    const tokens = await tokenRes.json();
    if (!tokens.access_token) return res.redirect(failRedirect);

    const profileRes = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
      headers: { Authorization: `Bearer ${tokens.access_token}` },
    });
    const profile = await profileRes.json();

    await sql`
      INSERT INTO oauth_tokens (practitioner_id, provider, access_token, refresh_token, expires_at, email, updated_at)
      VALUES (${practitionerId}, 'google', ${tokens.access_token}, ${tokens.refresh_token || null},
              ${new Date(Date.now() + tokens.expires_in * 1000).toISOString()},
              ${profile.email}, NOW())
      ON CONFLICT (practitioner_id, provider) DO UPDATE SET
        access_token  = EXCLUDED.access_token,
        refresh_token = COALESCE(EXCLUDED.refresh_token, oauth_tokens.refresh_token),
        expires_at    = EXCLUDED.expires_at,
        email         = EXCLUDED.email,
        updated_at    = NOW()
    `;

    return res.redirect(`https://${subdomain}.h-ld.com/admin.html?cal_connected=1`);
  }

  // ── Initiate OAuth flow — requires a real login, since we need to know
  // which practitioner is connecting. The frontend calls this via an
  // authenticated fetch and navigates the browser to the returned URL
  // itself (same pattern as the Stripe checkout/portal routes), rather
  // than this endpoint redirecting directly — a plain page navigation
  // can't carry an Authorization header. ──
  const org = await requireOrg(req, res);
  if (!org) return;
  const auth = requireAuth(req, res, org);
  if (!auth) return;

  // Signed, short-lived state token carries identity through Google's
  // redirect — this replaces the old random-hex-plus-cookie CSRF pattern
  // with something that's both tamper-proof AND tells the callback who's
  // connecting, since a cookie wouldn't survive the redirect back from an
  // unauthenticated context reliably across all browsers/subdomains.
  const stateToken = signToken(
    { practitioner_id: auth.practitioner_id, subdomain: org.subdomain, purpose: 'google_oauth' },
    { expiresIn: '10m' }
  );

  const params = new URLSearchParams({
    client_id:     process.env.GOOGLE_CLIENT_ID,
    redirect_uri:  REDIRECT_URI,
    response_type: 'code',
    scope:         'https://www.googleapis.com/auth/calendar https://www.googleapis.com/auth/userinfo.email',
    access_type:   'offline',
    prompt:        'consent',
    state: stateToken,
  });

  return res.json({ url: `https://accounts.google.com/o/oauth2/v2/auth?${params}` });
}
