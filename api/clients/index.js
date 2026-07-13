// api/clients/index.js
import sql from '../../lib/db.js';
import { requireAuth } from '../../lib/auth.js';
 
export default async function handler(req, res) {
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (!requireAuth(req, res)) return;
 
  if (req.method === 'GET') {
    const rows = await sql`SELECT * FROM clients ORDER BY last, first`;
    return res.json(rows);
  }
 
  // PUT — bulk replace (sync-cache pattern)
  if (req.method === 'PUT') {
    const clients = Array.isArray(req.body) ? req.body : [];
    const incomingIds = clients.map(c => c.id);
 
    if (incomingIds.length > 0) {
      await sql`
        DELETE FROM clients
        WHERE NOT (id = ANY(SELECT jsonb_array_elements_text(${JSON.stringify(incomingIds)}::jsonb)))
      `;
    } else {
      await sql`DELETE FROM clients`;
    }
 
    for (const c of clients) {
      await sql`
        INSERT INTO clients (id, first, last, email, phone, address, dob, referral, tags, notes)
        VALUES (${c.id}, ${c.first}, ${c.last || null}, ${c.email || null}, ${c.phone || null},
                ${c.address || null}, ${c.dob || null}, ${c.referral || null}, ${c.tags || null},
                ${JSON.stringify(c.notes || [])})
        ON CONFLICT (id) DO UPDATE SET
          first = EXCLUDED.first, last = EXCLUDED.last, email = EXCLUDED.email,
          phone = EXCLUDED.phone, address = EXCLUDED.address, dob = EXCLUDED.dob,
          referral = EXCLUDED.referral, tags = EXCLUDED.tags, notes = EXCLUDED.notes,
          updated_at = NOW()
      `;
    }
 
    return res.json({ ok: true, count: clients.length });
  }
 
  if (req.method === 'POST') {
    const c = req.body;
    const [row] = await sql`
      INSERT INTO clients (id, first, last, email, phone, address, dob, referral, tags, notes)
      VALUES (${c.id}, ${c.first}, ${c.last || null}, ${c.email || null}, ${c.phone || null},
              ${c.address || null}, ${c.dob || null}, ${c.referral || null}, ${c.tags || null},
              ${JSON.stringify(c.notes || [])})
      ON CONFLICT (id) DO UPDATE SET
        first = EXCLUDED.first, last = EXCLUDED.last, email = EXCLUDED.email,
        phone = EXCLUDED.phone, address = EXCLUDED.address, dob = EXCLUDED.dob,
        referral = EXCLUDED.referral, tags = EXCLUDED.tags, notes = EXCLUDED.notes,
        updated_at = NOW()
      RETURNING *
    `;
    return res.status(201).json(row);
  }
 
  res.status(405).json({ error: 'Method not allowed' });
}
 
