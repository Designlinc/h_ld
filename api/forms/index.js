// api/forms/index.js
import sql from '../../lib/db.js';
import { requireAuth } from '../../lib/auth.js';
import { requireOrg } from '../../lib/tenant.js';

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') return res.status(200).end();

  const org = await requireOrg(req, res);
  if (!org) return;

  // GET is public — the client-facing intake page needs to read the
  // relevant form's field definitions to render it.
  if (req.method === 'GET') {
    const rows = await sql`
      SELECT * FROM forms WHERE organization_id = ${org.id} ORDER BY created_at ASC
    `;
    return res.json(rows);
  }

  const auth = requireAuth(req, res, org);
  if (!auth) return;

  if (req.method === 'PUT') {
    const forms = Array.isArray(req.body) ? req.body : [];
    const incomingIds = forms.map(f => f.id);

    if (incomingIds.length > 0) {
      await sql`
        DELETE FROM forms
        WHERE organization_id = ${org.id}
        AND NOT (id = ANY(SELECT jsonb_array_elements_text(${JSON.stringify(incomingIds)}::jsonb)))
      `;
    } else {
      await sql`DELETE FROM forms WHERE organization_id = ${org.id}`;
    }

    for (const f of forms) {
      await sql`
        INSERT INTO forms (id, organization_id, name, service_id, active, fields)
        VALUES (${f.id}, ${org.id}, ${f.name}, ${f.serviceId || null}, ${f.active !== false}, ${JSON.stringify(f.fields || [])})
        ON CONFLICT (id) DO UPDATE SET
          name = EXCLUDED.name, service_id = EXCLUDED.service_id,
          active = EXCLUDED.active, fields = EXCLUDED.fields
        WHERE forms.organization_id = ${org.id}
      `;
    }

    return res.json({ ok: true, count: forms.length });
  }

  res.status(405).json({ error: 'Method not allowed' });
}
