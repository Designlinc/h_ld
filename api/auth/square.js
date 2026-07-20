// api/auth/square.js — Square OAuth (initiate + callback combined)
// Same shape as api/auth/google.js — see that file for the reasoning
// behind the signed-state pattern instead of a plain CSRF cookie.
import sql from '../../lib/db.js';
import { requireAuth, signToken, verifyToken } from '../../lib/auth.js';
import { requireOrg } from '../../lib/tenant.js';

const SQUARE_ENV = process.env.SQUARE_ENV || 'production';
const SQUARE_BASE_URL = SQUARE_ENV === 'sandbox'
  ? 'https://connect.squareupsandbox.com'
  : 'https://connect.squareup.com';
const REDIRECT_URI = process.env.SQUARE_REDIRECT_URI;

// Scopes needed for the Payment Links flow this app actually uses —
// creating payment links, reading payment status (for the webhook), and
// reading merchant/location info to know where to send the money.
const SCOPES = 'MERCHANT_PROFILE_READ PAYMENTS_WRITE PAYMENTS_READ ORDERS_WRITE ORDERS_READ';

export default async function handler(req, res) {
  const { code, error, state } = req.query;

  // ── Callback from Square ──
  if (code || error) {
    if (error || !code) return res.redirect('https://h-ld.com/?square_error=1');

    const decoded = verifyToken(state);
    if (!decoded || decoded.purpose !== 'square_oauth') {
      return res.redirect('https://h-ld.com/?square_error=1');
    }
    const { practitioner_id: practitionerId, subdomain } = decoded;
    const failRedirect = `https://${subdomain}.h-ld.com/admin.html?square_error=1`;

    const tokenRes = await fetch(`${SQUARE_BASE_URL}/oauth2/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Square-Version': '2026-05-20' },
      body: JSON.stringify({
        client_id:     process.env.SQUARE_APP_ID,
        client_secret: process.env.SQUARE_APP_SECRET,
        code,
        redirect_uri:  REDIRECT_URI,
        grant_type:    'authorization_code',
      }),
    });
    const tokens = await tokenRes.json();
    if (!tokens.access_token) {
      console.error('Square token exchange failed:', JSON.stringify(tokens));
      return res.redirect(failRedirect);
    }

    // Payment Links require a location_id — fetch the merchant's locations
    // and use the first active one. Most solo practitioners have exactly
    // one location; if there's ever a need to choose between several,
    // that's a settings-page enhancement for later, not blocking today.
    const locRes = await fetch(`${SQUARE_BASE_URL}/v2/locations`, {
      headers: { Authorization: `Bearer ${tokens.access_token}`, 'Square-Version': '2026-05-20' },
    });
    const locData = await locRes.json();
    const location = locData.locations?.find(l => l.status === 'ACTIVE') || locData.locations?.[0];
    if (!location) {
      console.error('No Square location found for this account');
      return res.redirect(failRedirect);
    }

    await sql`
      INSERT INTO oauth_tokens (practitioner_id, provider, access_token, refresh_token, expires_at, email, metadata, updated_at)
      VALUES (${practitionerId}, 'square', ${tokens.access_token}, ${tokens.refresh_token || null},
              ${tokens.expires_at}, ${location.name || 'Square account'},
              ${JSON.stringify({ merchantId: tokens.merchant_id, locationId: location.id, locationName: location.name })}, NOW())
      ON CONFLICT (practitioner_id, provider) DO UPDATE SET
        access_token  = EXCLUDED.access_token,
        refresh_token = COALESCE(EXCLUDED.refresh_token, oauth_tokens.refresh_token),
        expires_at    = EXCLUDED.expires_at,
        email         = EXCLUDED.email,
        metadata      = EXCLUDED.metadata,
        updated_at    = NOW()
    `;

    return res.redirect(`https://${subdomain}.h-ld.com/admin.html?square_connected=1`);
  }

  // ── Initiate OAuth flow — same authenticated-fetch-then-redirect
  // pattern as Google, for the same reason (no Authorization header
  // survives a plain page navigation). ──
  const org = await requireOrg(req, res);
  if (!org) return;
  const auth = requireAuth(req, res, org);
  if (!auth) return;

  const stateToken = signToken(
    { practitioner_id: auth.practitioner_id, subdomain: org.subdomain, purpose: 'square_oauth' },
    { expiresIn: '10m' }
  );

  const params = new URLSearchParams({
    client_id:     process.env.SQUARE_APP_ID,
    scope:         SCOPES,
    session:       'false',
    state: stateToken,
    redirect_uri:  REDIRECT_URI,
  });

  return res.json({ url: `${SQUARE_BASE_URL}/oauth2/authorize?${params}` });
}
