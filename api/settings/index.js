// api/settings/index.js
import sql from '../../lib/db.js';
import { requireAuth, verifyToken } from '../../lib/auth.js';
import { requireOrg } from '../../lib/tenant.js';

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') return res.status(200).end();

  const org = await requireOrg(req, res);
  if (!org) return;

  // GET is public — used by the client-facing booking page
  if (req.method === 'GET') {
    const rows = await sql`SELECT key, value FROM settings WHERE organization_id = ${org.id}`;
    const obj = {};
    rows.forEach(r => { obj[r.key] = r.value; });

    // Connection status is only meaningful to an authenticated practitioner
    // looking at their own settings — the public booking page doesn't get
    // this at all. Shaped as an object keyed by provider (e.g.
    // connected.google.email) to match what the frontend's getCalAccounts()
    // actually reads; an earlier version of this endpoint returned an
    // array here, which getCalAccounts() would never have matched against
    // — connected accounts would never have shown as connected in the UI
    // regardless of whether the OAuth flow itself worked correctly.
    const authHeader = req.headers.authorization || '';
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
    const payload = token ? verifyToken(token) : null;

    if (payload && payload.organization_id === org.id) {
      const tokens = await sql`
        SELECT provider, email, updated_at FROM oauth_tokens WHERE practitioner_id = ${payload.practitioner_id}
      `;
      obj._connected = {};
      tokens.forEach(t => {
        obj._connected[t.provider] = { email: t.email, connectedAt: t.updated_at };
      });
    }

    return res.json(obj);
  }

  // All other methods require auth
  const auth = requireAuth(req, res, org);
  if (!auth) return;

  if (req.method === 'POST') {
    // AI Assistant proxy — the browser can't call api.anthropic.com directly
    // (blocked by CORS, and would require exposing an API key client-side).
    // This forwards the request server-side using ANTHROPIC_API_KEY.
    // Deliberately using one global key across all organizations for now
    // (you're absorbing this cost rather than each org supplying their
    // own) — revisit if usage ever becomes meaningful.
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
      INSERT INTO settings (organization_id, key, value, updated_at)
      VALUES (${org.id}, ${key}, ${JSON.stringify(value)}, NOW())
      ON CONFLICT (organization_id, key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()
    `;
    return res.json({ ok: true });
  }

  if (req.method === 'DELETE') {
    // Disconnect an OAuth provider — for THIS practitioner specifically,
    // not the whole org, since each staff member connects their own
    // calendar/payment account.
    const { provider } = req.body;
    if (!provider) return res.status(400).json({ error: 'provider required' });
    await sql`
      DELETE FROM oauth_tokens WHERE provider = ${provider} AND practitioner_id = ${auth.practitioner_id}
    `;
    return res.json({ ok: true });
  }

  res.status(405).json({ error: 'Method not allowed' });
}
