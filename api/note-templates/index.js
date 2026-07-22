// api/note-templates/index.js
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
      SELECT * FROM note_templates WHERE organization_id = ${org.id} ORDER BY created_at ASC
    `;
    return res.json(rows);
  }

  if (req.method === 'PUT') {
    const templates = Array.isArray(req.body) ? req.body : [];
    const incomingIds = templates.map(t => t.id);

    if (incomingIds.length > 0) {
      await sql`
        DELETE FROM note_templates
        WHERE organization_id = ${org.id}
        AND NOT (id = ANY(SELECT jsonb_array_elements_text(${JSON.stringify(incomingIds)}::jsonb)))
      `;
    } else {
      await sql`DELETE FROM note_templates WHERE organization_id = ${org.id}`;
    }

    for (const t of templates) {
      await sql`
        INSERT INTO note_templates (id, organization_id, name, html, is_default)
        VALUES (${t.id}, ${org.id}, ${t.name}, ${t.html || null}, ${!!t.isDefault})
        ON CONFLICT (id) DO UPDATE SET
          name = EXCLUDED.name, html = EXCLUDED.html, is_default = EXCLUDED.is_default
        WHERE note_templates.organization_id = ${org.id}
      `;
    }

    return res.json({ ok: true, count: templates.length });
  }

  res.status(405).json({ error: 'Method not allowed' });
}
