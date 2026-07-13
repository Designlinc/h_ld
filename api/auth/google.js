// api/auth/google.js — Google OAuth (initiate + callback combined)
// GET (no params)      → redirect to Google consent screen
// GET ?code=... / ?error=... → handle callback from Google
import crypto from 'crypto';
import sql from '../../lib/db.js';

// Simple cookie parser — avoids pulling in a dependency for one field
function getCookie(req, name) {
  const header = req.headers.cookie || '';
  const match = header.split(';').map(c => c.trim()).find(c => c.startsWith(name + '='));
  return match ? decodeURIComponent(match.split('=')[1]) : null;
}

export default async function handler(req, res) {
  const { code, error, state } = req.query;

  // ── Callback from Google ──
  if (code || error) {
    if (error || !code) return res.redirect('/solful-admin.html?cal_error=1');

    // Verify the state param matches the one we set when the flow started.
    // Without this, an attacker could initiate their own OAuth flow, get a
    // valid `code` for THEIR Google account, then trick an admin into
    // visiting this callback URL — silently linking the admin's calendar
    // integration to the attacker's account instead.
    const expectedState = getCookie(req, 'g_oauth_state');
    if (!expectedState || state !== expectedState) {
      return res.redirect('/solful-admin.html?cal_error=1');
    }
    // Clear the one-time state cookie now that it's been used
    res.setHeader('Set-Cookie', 'g_oauth_state=; Max-Age=0; Path=/; HttpOnly; Secure; SameSite=Lax');

    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id:     process.env.GOOGLE_CLIENT_ID,
        client_secret: process.env.GOOGLE_CLIENT_SECRET,
        redirect_uri:  process.env.GOOGLE_REDIRECT_URI,
        grant_type:    'authorization_code',
      }),
    });

    const tokens = await tokenRes.json();
    if (!tokens.access_token) return res.redirect('/solful-admin.html?cal_error=1');

    const profileRes = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
      headers: { Authorization: `Bearer ${tokens.access_token}` },
    });
    const profile = await profileRes.json();

    await sql`
      INSERT INTO oauth_tokens (provider, access_token, refresh_token, expires_at, email, updated_at)
      VALUES ('google', ${tokens.access_token}, ${tokens.refresh_token || null},
              ${new Date(Date.now() + tokens.expires_in * 1000).toISOString()},
              ${profile.email}, NOW())
      ON CONFLICT (provider) DO UPDATE SET
        access_token  = EXCLUDED.access_token,
        refresh_token = COALESCE(EXCLUDED.refresh_token, oauth_tokens.refresh_token),
        expires_at    = EXCLUDED.expires_at,
        email         = EXCLUDED.email,
        updated_at    = NOW()
    `;

    return res.redirect('/solful-admin.html?cal_connected=1');
  }

  // ── Initiate OAuth flow ──
  const oauthState = crypto.randomBytes(16).toString('hex');
  res.setHeader('Set-Cookie', `g_oauth_state=${oauthState}; Max-Age=600; Path=/; HttpOnly; Secure; SameSite=Lax`);

  const params = new URLSearchParams({
    client_id:     process.env.GOOGLE_CLIENT_ID,
    redirect_uri:  process.env.GOOGLE_REDIRECT_URI,
    response_type: 'code',
    scope:         'https://www.googleapis.com/auth/calendar https://www.googleapis.com/auth/userinfo.email',
    access_type:   'offline',
    prompt:        'consent',
    state:         oauthState,
  });
  res.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params}`);
}
