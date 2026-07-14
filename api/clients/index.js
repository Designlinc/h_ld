// api/clients/index.js
import sql from '../../lib/db.js';
import { requireAuth } from '../../lib/auth.js';
import { requireOrg } from '../../lib/tenant.js';

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') return res.status(200).end();

  const org = await requireOrg(req, res);
  if (!org) return;

  const auth = requireAuth(req, res, org);
  if (!auth) return;

  if (req.method === 'GET') {
    const rows = await sql`
      SELECT * FROM clients WHERE organization_id = ${org.id} ORDER BY last, first
    `;
    return res.json(rows);
  }

  // PUT — bulk replace (sync-cache pattern)
  if (req.method === 'PUT') {
    const clients = Array.isArray(req.body) ? req.body : [];
    const incomingIds = clients.map(c => c.id);

    if (incomingIds.length > 0) {
      await sql`
        DELETE FROM clients
        WHERE organization_id = ${org.id}
        AND NOT (id = ANY(SELECT jsonb_array_elements_text(${JSON.stringify(incomingIds)}::jsonb)))
      `;
    } else {
      await sql`DELETE FROM clients WHERE organization_id = ${org.id}`;
    }

    for (const c of clients) {
      await sql`
        INSERT INTO clients (id, organization_id, first, last, email, phone, address, dob, referral, tags, notes)
        VALUES (${c.id}, ${org.id}, ${c.first}, ${c.last || null}, ${c.email || null}, ${c.phone || null},
                ${c.address || null}, ${c.dob || null}, ${c.referral || null}, ${c.tags || null},
                ${JSON.stringify(c.notes || [])})
        ON CONFLICT (id) DO UPDATE SET
          first = EXCLUDED.first, last = EXCLUDED.last, email = EXCLUDED.email,
          phone = EXCLUDED.phone, address = EXCLUDED.address, dob = EXCLUDED.dob,
          referral = EXCLUDED.referral, tags = EXCLUDED.tags, notes = EXCLUDED.notes,
          updated_at = NOW()
        WHERE clients.organization_id = ${org.id}
      `;
    }

    return res.json({ ok: true, count: clients.length });
  }

  if (req.method === 'POST') {
    const c = req.body;
    const [row] = await sql`
      INSERT INTO clients (id, organization_id, first, last, email, phone, address, dob, referral, tags, notes)
      VALUES (${c.id}, ${org.id}, ${c.first}, ${c.last || null}, ${c.email || null}, ${c.phone || null},
              ${c.address || null}, ${c.dob || null}, ${c.referral || null}, ${c.tags || null},
              ${JSON.stringify(c.notes || [])})
      ON CONFLICT (id) DO UPDATE SET
        first = EXCLUDED.first, last = EXCLUDED.last, email = EXCLUDED.email,
        phone = EXCLUDED.phone, address = EXCLUDED.address, dob = EXCLUDED.dob,
        referral = EXCLUDED.referral, tags = EXCLUDED.tags, notes = EXCLUDED.notes,
        updated_at = NOW()
      WHERE clients.organization_id = ${org.id}
      RETURNING *
    `;
    return res.status(201).json(row);
  }

  res.status(405).json({ error: 'Method not allowed' });
}
