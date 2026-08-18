// api/config/maps-key.js — public endpoint exposing the Google Maps API
// key to the frontend, for address autocomplete on the Business Info
// field. Same pattern as api/push/index.js's VAPID public key. A Maps API
// key is meant to be used client-side and restricted by HTTP referrer in
// the Google Cloud console (restrict to *.h-ld.com) — that's the actual
// security boundary, not keeping it out of the frontend.
export default async function handler(req, res) {
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).end();
  return res.json({ key: process.env.GOOGLE_MAPS_API_KEY || null });
}
