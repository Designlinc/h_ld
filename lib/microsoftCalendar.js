// lib/microsoftCalendar.js — get a valid Microsoft access token for a
// practitioner, refreshing it first if it's expired. Mirrors
// lib/googleCalendar.js exactly; shared between calendar/sync.js and
// anywhere else that needs Microsoft Graph access.
import sql from './db.js';

export async function getValidMicrosoftToken(practitionerId) {
  const [token] = await sql`
    SELECT * FROM oauth_tokens WHERE practitioner_id = ${practitionerId} AND provider = 'microsoft'
  `;
  if (!token) throw new Error('Microsoft Calendar is not connected for this practitioner');

  if (new Date(token.expires_at) > new Date(Date.now() + 60000)) {
    return token.access_token; // still valid for at least another minute
  }

  const res = await fetch('https://login.microsoftonline.com/common/oauth2/v2.0/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id:     process.env.MICROSOFT_CLIENT_ID,
      client_secret: process.env.MICROSOFT_CLIENT_SECRET,
      refresh_token: token.refresh_token,
      grant_type:    'refresh_token',
      scope:         'offline_access Calendars.ReadWrite User.Read',
    }),
  });
  const data = await res.json();
  if (!data.access_token) {
    throw new Error('Microsoft Calendar connection has expired — please reconnect it in Settings');
  }

  await sql`
    UPDATE oauth_tokens SET
      access_token  = ${data.access_token},
      refresh_token = COALESCE(${data.refresh_token || null}, refresh_token),
      expires_at    = ${new Date(Date.now() + data.expires_in * 1000).toISOString()},
      updated_at    = NOW()
    WHERE practitioner_id = ${practitionerId} AND provider = 'microsoft'
  `;
  return data.access_token;
}
