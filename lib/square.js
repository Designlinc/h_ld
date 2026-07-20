// lib/square.js — get a valid Square access token (+ location) for a
// practitioner, refreshing first if expired. Square's OAuth token
// responses differ from Google's in two ways worth noting:
//   - expires_at comes back as a ready-made ISO string, not seconds-until-expiry
//   - the refresh_token itself rotates on every refresh and must be re-saved,
//     unlike Google's refresh_token which stays the same indefinitely
import sql from './db.js';

const SQUARE_ENV = process.env.SQUARE_ENV || 'production';
const SQUARE_BASE_URL = SQUARE_ENV === 'sandbox'
  ? 'https://connect.squareupsandbox.com'
  : 'https://connect.squareup.com';

export async function getValidSquareToken(practitionerId) {
  const [token] = await sql`
    SELECT * FROM oauth_tokens WHERE practitioner_id = ${practitionerId} AND provider = 'square'
  `;
  if (!token) throw new Error('Square is not connected for this practitioner');

  const metadata = token.metadata || {};
  const locationId = metadata.locationId;
  if (!locationId) throw new Error('Square is connected but no location was found — try reconnecting it in Settings');

  if (new Date(token.expires_at) > new Date(Date.now() + 60000)) {
    return { accessToken: token.access_token, locationId };
  }

  const res = await fetch(`${SQUARE_BASE_URL}/oauth2/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Square-Version': '2026-05-20' },
    body: JSON.stringify({
      client_id:     process.env.SQUARE_APP_ID,
      client_secret: process.env.SQUARE_APP_SECRET,
      refresh_token: token.refresh_token,
      grant_type:    'refresh_token',
    }),
  });
  const data = await res.json();
  if (!data.access_token) {
    throw new Error('Square connection has expired — please reconnect it in Settings');
  }

  await sql`
    UPDATE oauth_tokens SET
      access_token  = ${data.access_token},
      refresh_token = ${data.refresh_token || token.refresh_token},
      expires_at    = ${data.expires_at},
      updated_at    = NOW()
    WHERE practitioner_id = ${practitionerId} AND provider = 'square'
  `;
  return { accessToken: data.access_token, locationId };
}
