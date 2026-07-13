// api/services/index.js
import sql from '../../lib/db.js';
import { requireAuth } from '../../lib/auth.js';

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') return res.status(200).end();

  // GET is public — used by booking page
  if (req.method === 'GET') {
    const rows = await sql`SELECT * FROM services ORDER BY sort_order ASC NULLS LAST, name ASC`;
    return res.json(rows);
  }

  if (!requireAuth(req, res)) return;

  // PUT — bulk replace (sync-cache pattern: client mutates array locally
  // then pushes the whole list back). The client sends each service's
  // position in the array as sort_order, so drag-reordering persists.
  if (req.method === 'PUT') {
    const services = Array.isArray(req.body) ? req.body : [];
    const incomingIds = services.map(s => s.id);

    if (incomingIds.length > 0) {
      await sql`
        DELETE FROM services
        WHERE NOT (id = ANY(SELECT jsonb_array_elements_text(${JSON.stringify(incomingIds)}::jsonb)))
      `;
    } else {
      await sql`DELETE FROM services`;
    }

    for (let i = 0; i < services.length; i++) {
      const s = services[i];
      const sortOrder = s.sort_order != null ? s.sort_order : i;
      await sql`
        INSERT INTO services (id, name, description, duration, price, category, location, icon, image, active, sort_order)
        VALUES (${s.id}, ${s.name}, ${s.desc || null}, ${s.duration || 60}, ${s.price || 0},
                ${s.category || null}, ${s.location || null}, ${s.icon || null}, ${s.image || null},
                ${s.active !== false}, ${sortOrder})
        ON CONFLICT (id) DO UPDATE SET
          name = EXCLUDED.name, description = EXCLUDED.description,
          duration = EXCLUDED.duration, price = EXCLUDED.price,
          category = EXCLUDED.category, location = EXCLUDED.location,
          icon = EXCLUDED.icon, image = EXCLUDED.image, active = EXCLUDED.active,
          sort_order = EXCLUDED.sort_order
      `;
    }

    return res.json({ ok: true, count: services.length });
  }

  if (req.method === 'POST') {
    const s = req.body;
    // New services go to the end of the list rather than jumping to the
    // front with a NULL sort_order.
    const [{ next_order }] = await sql`
      SELECT COALESCE(MAX(sort_order), -1) + 1 AS next_order FROM services
    `;
    const [row] = await sql`
      INSERT INTO services (id, name, description, duration, price, category, location, icon, image, active, sort_order)
      VALUES (${s.id}, ${s.name}, ${s.desc || null}, ${s.duration || 60}, ${s.price || 0},
              ${s.category || null}, ${s.location || null}, ${s.icon || null}, ${s.image || null},
              ${s.active !== false}, ${s.sort_order != null ? s.sort_order : next_order})
      ON CONFLICT (id) DO UPDATE SET
        name = EXCLUDED.name, description = EXCLUDED.description,
        duration = EXCLUDED.duration, price = EXCLUDED.price,
        category = EXCLUDED.category, location = EXCLUDED.location,
        icon = EXCLUDED.icon, image = EXCLUDED.image, active = EXCLUDED.active,
        sort_order = EXCLUDED.sort_order
      RETURNING *
    `;
    return res.status(201).json(row);
  }

  if (req.method === 'DELETE') {
    const { id } = req.query;
    await sql`DELETE FROM services WHERE id = ${id}`;
    return res.status(204).end();
  }

  res.status(405).json({ error: 'Method not allowed' });
}
