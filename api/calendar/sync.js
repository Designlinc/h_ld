// api/calendar/sync.js — push a booking to Google Calendar
import sql from '../../lib/db.js';
import { requireAuth } from '../../lib/auth.js';

async function getAccessToken() {
  const [token] = await sql`SELECT * FROM oauth_tokens WHERE provider = 'google'`;
  if (!token) throw new Error('Google not connected');

  // Refresh if expired
  if (new Date(token.expires_at) < new Date(Date.now() + 60000)) {
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
    await sql`
      UPDATE oauth_tokens SET
        access_token = ${data.access_token},
        expires_at   = ${new Date(Date.now() + data.expires_in * 1000).toISOString()},
        updated_at   = NOW()
      WHERE provider = 'google'
    `;
    return data.access_token;
  }
  return token.access_token;
}

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (!requireAuth(req, res)) return;
  if (req.method !== 'POST') return res.status(405).end();

  const { bookingId } = req.body;
  const [b] = await sql`SELECT * FROM bookings WHERE id = ${bookingId}`;
  if (!b) return res.status(404).json({ error: 'Booking not found' });

  try {
    const accessToken = await getAccessToken();
    const appUrl = process.env.NEXT_PUBLIC_APP_URL;
    const paymentUrl = `${appUrl}/solful-pay.html?payment=${b.id}`;

    // Normalise date — Postgres DATE comes back as a Date object or ISO string
    const dateStr = typeof b.date === 'string'
      ? b.date.slice(0, 10)
      : `${b.date.getUTCFullYear()}-${String(b.date.getUTCMonth()+1).padStart(2,'0')}-${String(b.date.getUTCDate()).padStart(2,'0')}`;

    // Normalise time — handle plain "HH:MM", with-seconds "HH:MM:SS",
    // or JSON-encoded "\"HH:MM\"" from Postgres
    let rawTime = b.time || '09:00';
    if (typeof rawTime === 'string' && rawTime.startsWith('"')) rawTime = JSON.parse(rawTime);
    const timeStr = rawTime.slice(0, 5);

    // Build start/end datetime
    const startDt = new Date(`${dateStr}T${timeStr}:00`);
    if (isNaN(startDt.getTime())) throw new Error(`Invalid date/time: ${dateStr} ${timeStr}`);
    const endDt = new Date(startDt.getTime() + (b.duration || 60) * 60000);
    const fmtDt = (dt) => {
      const y = dt.getFullYear(), mo = String(dt.getMonth()+1).padStart(2,'0'), day = String(dt.getDate()).padStart(2,'0');
      const h = String(dt.getHours()).padStart(2,'0'), m = String(dt.getMinutes()).padStart(2,'0');
      return `${y}-${mo}-${day}T${h}:${m}:00`;
    };

    const event = {
      summary: `${b.service_name} — ${b.client_name}`,
      description: `Client: ${b.client_name}\nService: ${b.service_name}\nDuration: ${b.duration} min\nPrice: $${b.price}\n\n💳 Take payment:\n${paymentUrl}`,
      start: { dateTime: fmtDt(startDt), timeZone: 'Australia/Sydney' },
      end:   { dateTime: fmtDt(endDt),   timeZone: 'Australia/Sydney' },
    };

    let gcRes;
    if (b.google_event_id) {
      // Update existing event
      gcRes = await fetch(`https://www.googleapis.com/calendar/v3/calendars/primary/events/${b.google_event_id}`, {
        method: 'PUT',
        headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(event),
      });
    } else {
      // Create new event
      gcRes = await fetch('https://www.googleapis.com/calendar/v3/calendars/primary/events', {
        method: 'POST',
        headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(event),
      });
    }

    const gcData = await gcRes.json();
    if (gcData.id) {
      await sql`UPDATE bookings SET google_event_id = ${gcData.id} WHERE id = ${b.id}`;
    }

    return res.json({ ok: true, eventId: gcData.id });
  } catch (err) {
    console.error('Calendar sync error:', err);
    return res.status(500).json({ error: err.message });
  }
}
