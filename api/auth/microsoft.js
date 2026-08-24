// api/auth/microsoft.js — Microsoft OAuth (initiate + callback combined),
// for Microsoft 365 / Exchange / Outlook calendar access via the
// Microsoft identity platform. Structured identically to api/auth/google.js
// — same signed-state pattern, same oauth_tokens storage, same
// fixed-callback-URL reasoning — so anyone maintaining one can follow the
// other directly.
// GET (with Authorization header, no code param) → returns { url } to redirect to
// GET ?code=... / ?error=...                     → callback from Microsoft, no auth possible here
import sql from '../../lib/db.js';
import { requireAuth, signToken, verifyToken } from '../../lib/auth.js';
import { requireOrg } from '../../lib/tenant.js';

// Microsoft, like Google, requires an exact pre-registered redirect URI —
// identity is recovered from the signed `state` param on the way back,
// not the Host header, same reasoning as the Google flow.
const REDIRECT_URI = process.env.MICROSOFT_REDIRECT_URI;

// "common" allows both personal Microsoft accounts and any Azure AD work/
// school tenant to sign in — the right choice here since practitioners
// bring their own Microsoft 365/Exchange accounts from whatever
// organisation they belong to, not one specific tenant we control.
const AUTHORITY = 'https://login.microsoftonline.com/common/oauth2/v2.0';

export default async function handler(req, res) {
  const { code, error, state } = req.query;

  // ── Callback from Microsoft — no Authorization header is possible
  // here, this is a plain browser redirect Microsoft issued. ──
  if (code || error) {
    if (error || !code) return res.redirect('https://h-ld.com/?cal_error=1');

    const decoded = verifyToken(state);
    if (!decoded || decoded.purpose !== 'microsoft_oauth') {
      return res.redirect('https://h-ld.com/?cal_error=1');
    }
    const { practitioner_id: practitionerId, subdomain } = decoded;
    const failRedirect = `https://${subdomain}.h-ld.com/admin.html?cal_error=1&provider=microsoft`;

    const tokenRes = await fetch(`${AUTHORITY}/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id:     process.env.MICROSOFT_CLIENT_ID,
        client_secret: process.env.MICROSOFT_CLIENT_SECRET,
        redirect_uri:  REDIRECT_URI,
        grant_type:    'authorization_code',
        scope:         'offline_access Calendars.ReadWrite User.Read',
      }),
    });

    const tokens = await tokenRes.json();
    if (!tokens.access_token) return res.redirect(failRedirect);

    const profileRes = await fetch('https://graph.microsoft.com/v1.0/me', {
      headers: { Authorization: `Bearer ${tokens.access_token}` },
    });
    const profile = await profileRes.json();
    // mail is null for some account types (e.g. certain personal
    // accounts) — userPrincipalName is always present as a fallback.
    const email = profile.mail || profile.userPrincipalName || null;

    await sql`
      INSERT INTO oauth_tokens (practitioner_id, provider, access_token, refresh_token, expires_at, email, updated_at)
      VALUES (${practitionerId}, 'microsoft', ${tokens.access_token}, ${tokens.refresh_token || null},
              ${new Date(Date.now() + tokens.expires_in * 1000).toISOString()},
              ${email}, NOW())
      ON CONFLICT (practitioner_id, provider) DO UPDATE SET
        access_token  = EXCLUDED.access_token,
        refresh_token = COALESCE(EXCLUDED.refresh_token, oauth_tokens.refresh_token),
        expires_at    = EXCLUDED.expires_at,
        email         = EXCLUDED.email,
        updated_at    = NOW()
    `;

    return res.redirect(`https://${subdomain}.h-ld.com/admin.html?cal_connected=1&provider=microsoft`);
  }

  // ── Initiate OAuth flow — same reasoning as Google: requires a real
  // login, frontend calls this via authenticated fetch and navigates the
  // browser to the returned URL itself. ──
  const org = await requireOrg(req, res);
  if (!org) return;
  const auth = requireAuth(req, res, org);
  if (!auth) return;

  const stateToken = signToken(
    { practitioner_id: auth.practitioner_id, subdomain: org.subdomain, purpose: 'microsoft_oauth' },
    { expiresIn: '10m' }
  );

  const params = new URLSearchParams({
    client_id:     process.env.MICROSOFT_CLIENT_ID,
    redirect_uri:  REDIRECT_URI,
    response_type: 'code',
    response_mode: 'query',
    scope:         'offline_access Calendars.ReadWrite User.Read',
    // Forces the account picker every time, same reasoning as Google's
    // prompt=consent — without it, a practitioner who's already signed
    // into a personal Microsoft account in their browser could get
    // silently connected to the wrong account with no chance to choose.
    prompt: 'select_account',
    state: stateToken,
  });

  return res.json({ url: `${AUTHORITY}/authorize?${params}` });
}
