// lib/googleCalendar.js — get a valid Google access token for a practitioner,
// refreshing it first if it's expired. Shared between calendar/sync.js and
// anywhere else that needs Google API access, so refresh logic lives once.
import sql from './db.js';

export async function getValidGoogleToken(practitionerId) {
  const [token] = await sql`
    SELECT * FROM oauth_tokens WHERE practitioner_id = ${practitionerId} AND provider = 'google'
  `;
  if (!token) throw new Error('Google Calendar is not connected for this practitioner');

  if (new Date(token.expires_at) > new Date(Date.now() + 60000)) {
    return token.access_token; // still valid for at least another minute
  }

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id:     process.env.GOOGLE_CLIENT_ID,
      client_secret: process.env.GOOGLE_CLIENT_SECRET,
      refresh_token: token.refresh_token,
      grant_type:    'refresh_token',
    }),
  });
  const data = await res.json();
  if (!data.access_token) {
    throw new Error('Google Calendar connection has expired — please reconnect it in Settings');
  }

  await sql`
    UPDATE oauth_tokens SET
      access_token = ${data.access_token},
      expires_at   = ${new Date(Date.now() + data.expires_in * 1000).toISOString()},
      updated_at   = NOW()
    WHERE practitioner_id = ${practitionerId} AND provider = 'google'
  `;
  return data.access_token;
}
