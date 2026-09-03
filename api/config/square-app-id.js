// api/config/square-app-id.js — public endpoint exposing h_ld's Square
// Application ID to pay.html, which needs it client-side to build the
// square-commerce-v1:// deep link that opens Square Point of Sale with
// the payment amount pre-filled. This is h_ld's own platform-wide app
// identifier (the same value used server-side in api/auth/square.js's
// OAuth flow) — not a practitioner's own credentials — so it's the same
// kind of value already safely exposed via api/config/maps-key.js.
export default async function handler(req, res) {
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).end();
  return res.json({ appId: process.env.SQUARE_APP_ID || null });
}
