// api/config/turnstile-key.js — public endpoint exposing the Cloudflare
// Turnstile site key to the frontend, for the free bot/spam check on the
// signup form. Same pattern as api/config/maps-key.js. A Turnstile site key
// is meant to be used client-side — it's not a secret, and isn't the actual
// security boundary (TURNSTILE_SECRET_KEY, verified server-side in
// api/auth/signup.js, is). If unset, the frontend simply skips rendering
// the widget and signup proceeds unchecked, so this can be introduced
// without breaking local/staging environments that haven't configured it.
export default async function handler(req, res) {
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).end();
  return res.json({ key: process.env.TURNSTILE_SITE_KEY || null });
}
