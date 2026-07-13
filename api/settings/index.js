// api/settings/index.js
import sql from '../../lib/db.js';
import { requireAuth } from '../../lib/auth.js';

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') return res.status(200).end();

  // GET is public — used by the client-facing booking page
  if (req.method === 'GET') {
    const rows = await sql`SELECT key, value FROM settings`;
    const obj = {};
    rows.forEach(r => { obj[r.key] = r.value; });

    // Also include OAuth connection status (non-sensitive — just provider + email)
    const tokens = await sql`SELECT provider, email, updated_at FROM oauth_tokens`;
    obj._connected = {};
    tokens.forEach(t => { obj._connected[t.provider] = { email: t.email, connectedAt: t.updated_at }; });

    return res.json(obj);
  }

  // All other methods require auth
  if (!requireAuth(req, res)) return;

  if (req.method === 'POST') {
    // AI Assistant proxy — the browser can't call api.anthropic.com directly
    // (blocked by CORS, and would require exposing an API key client-side).
    // This forwards the request server-side using ANTHROPIC_API_KEY.
    if (req.body?.action === 'ai_parse') {
      const apiKey = process.env.ANTHROPIC_API_KEY;
      if (!apiKey) {
        return res.status(500).json({ error: 'AI assistant not configured — add ANTHROPIC_API_KEY to Vercel environment variables' });
      }
      const { system, messages } = req.body;
      if (!system || !messages) return res.status(400).json({ error: 'Missing system or messages' });

      try {
        const anthropicRes = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': apiKey,
            'anthropic-version': '2023-06-01',
          },
          body: JSON.stringify({
            model: 'claude-sonnet-4-20250514',
            max_tokens: 300,
            system,
            messages,
          }),
        });

        const data = await anthropicRes.json();

        if (!anthropicRes.ok) {
          console.error('Anthropic API error:', JSON.stringify(data));
          return res.status(502).json({ error: data.error?.message || 'AI request failed' });
        }

        return res.json(data);
      } catch (err) {
        console.error('AI proxy error:', err.message);
        return res.status(500).json({ error: err.message });
      }
    }

    const { key, value } = req.body;
    await sql`
      INSERT INTO settings (key, value, updated_at)
      VALUES (${key}, ${JSON.stringify(value)}, NOW())
      ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()
    `;
    return res.json({ ok: true });
  }

  if (req.method === 'DELETE') {
    // Delete an OAuth token (disconnect a provider)
    const { provider } = req.body;
    if (!provider) return res.status(400).json({ error: 'provider required' });
    await sql`DELETE FROM oauth_tokens WHERE provider = ${provider}`;
    return res.json({ ok: true });
  }

  res.status(405).json({ error: 'Method not allowed' });
}
