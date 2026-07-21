// api/admin/impersonate.js — start/end a support impersonation session
import sql from '../../lib/db.js';
import { requireSuperAdmin, signToken, verifyToken } from '../../lib/auth.js';
import { renderEmail } from '../../lib/emailTemplate.js';

const RESEND_API_KEY = process.env.RESEND_API_KEY;
const FROM_EMAIL = process.env.MFA_FROM_EMAIL || 'h_ld. <noreply@h-ld.com>';

// Turns "POST /api/bookings" into "Created bookings" — coarse but
// readable. Matches the same level of detail already shown in the
// super-admin's own activity log (method + endpoint, not a full diff).
function humanizeAction(method, path) {
  const verbMap = { POST: 'Created', PUT: 'Updated', PATCH: 'Updated', DELETE: 'Removed' };
  const verb = verbMap[method] || method;
  const clean = (path || '').replace(/^\/api\//, '').split('?')[0];
  const resource = (clean.split('/')[0] || 'account settings').replace(/-/g, ' ');
  return `${verb} ${resource}`;
}

function summarizeActions(actions) {
  const counts = {};
  actions.forEach(a => {
    const label = humanizeAction(a.method, a.path);
    counts[label] = (counts[label] || 0) + 1;
  });
  return Object.entries(counts).map(([label, count]) => count > 1 ? `${label} (×${count})` : label);
}

async function sendSessionSummaryEmail({ practitionerEmail, orgName, reason, consentGiven, actionLabels, startedAt, endedAt }) {
  if (!RESEND_API_KEY || !practitionerEmail) return;

  const openingLine = consentGiven
    ? `With your consent, our support team briefly accessed your ${orgName} account to help resolve your support request.`
    : `Our support team briefly accessed your ${orgName} account to help resolve an urgent support issue.`;

  const actionsHtml = actionLabels.length === 0
    ? `<p style="margin:0;font-size:14px;color:#8A868A">No changes were made — this was a view-only session.</p>`
    : `<ul style="margin:0;padding-left:20px;font-size:14px;color:#231F20;line-height:1.8">${actionLabels.map(a => `<li>${a}</li>`).join('')}</ul>`;

  const bodyHtml = `
    <p style="margin:0 0 16px;font-size:15px;color:#231F20;line-height:1.6">${openingLine}</p>
    ${reason ? `<p style="margin:0 0 16px;font-size:13px;color:#8A868A;line-height:1.6"><strong>Reason given:</strong> ${reason}</p>` : ''}
    <p style="margin:0 0 8px;font-size:13px;font-weight:700;color:#231F20;text-transform:uppercase;letter-spacing:.5px">What was done</p>
    ${actionsHtml}
    <p style="margin:20px 0 0;font-size:14px;color:#231F20;line-height:1.6">If your problem still isn't resolved, please get in touch so we can get to the bottom of it.</p>
  `;

  await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: FROM_EMAIL,
      to: practitionerEmail,
      subject: 'Admin assistance summary — your account was accessed by h_ld. support',
      html: renderEmail({ bodyHtml }),
    }),
  }).catch(err => console.error('Session summary email failed:', err.message));
}

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') return res.status(200).end();

  if (req.method === 'POST') {
    const auth = requireSuperAdmin(req, res);
    if (!auth) return;

    let { organizationId, reason } = req.body || {};
    const { requestId } = req.body || {};

    let requestIdToStore = null;

    // Starting from an approved consent request — verify it's actually
    // approved (not pending/denied/expired/already-used) and consume it
    // immediately so the same approval can't be replayed to open a
    // second session later.
    if (requestId) {
      const [request] = await sql`SELECT * FROM impersonation_requests WHERE id = ${requestId}`;
      if (!request) return res.status(404).json({ error: 'Request not found' });
      if (request.status !== 'approved') {
        return res.status(400).json({ error: 'This request has not been approved yet' });
      }
      organizationId = request.organization_id;
      reason = request.reason;
      requestIdToStore = request.id;
      await sql`UPDATE impersonation_requests SET status = 'used' WHERE id = ${requestId}`;
    }

    if (!organizationId) return res.status(400).json({ error: 'organizationId or requestId required' });

    const [org] = await sql`SELECT id, subdomain, name FROM organizations WHERE id = ${organizationId}`;
    if (!org) return res.status(404).json({ error: 'Organization not found' });

    // Impersonates the org's original (owner) practitioner — solo today,
    // but this is the sensible default even once a clinic has several
    // staff: support sees what the account owner sees.
    const [practitioner] = await sql`
      SELECT id, role FROM practitioners WHERE organization_id = ${organizationId} ORDER BY created_at ASC LIMIT 1
    `;
    if (!practitioner) return res.status(400).json({ error: 'This organization has no practitioners to impersonate' });

    const [logRow] = await sql`
      INSERT INTO impersonation_log (super_admin_id, organization_id, reason, started_at, request_id)
      VALUES (${auth.super_admin_id}, ${organizationId}, ${reason || null}, NOW(), ${requestIdToStore})
      RETURNING id
    `;

    // Short-lived (1h, vs a practitioner's normal 30 days) — a support
    // session shouldn't quietly linger valid for weeks.
    const token = signToken({
      practitioner_id: practitioner.id,
      organization_id: organizationId,
      organization_name: org.name,
      role: practitioner.role,
      impersonating: true,
      super_admin_id: auth.super_admin_id,
      impersonation_log_id: logRow.id,
    }, { expiresIn: '1h' });

    return res.json({ token, organization: { subdomain: org.subdomain, name: org.name } });
  }

  if (req.method === 'DELETE') {
    // Called with the IMPERSONATION token itself in the Authorization
    // header (from the practitioner-view session's "End impersonation"
    // button) — not a super-admin token. That's deliberate: this endpoint
    // just needs to confirm the caller genuinely holds a live
    // impersonation session and close its own audit log entry.
    const authHeader = req.headers.authorization || '';
    const rawToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
    const payload = rawToken ? verifyToken(rawToken) : null;
    if (!payload || !payload.impersonating) {
      return res.status(400).json({ error: 'Not an impersonation session' });
    }

    const [logRow] = await sql`
      UPDATE impersonation_log SET ended_at = NOW() WHERE id = ${payload.impersonation_log_id}
      RETURNING organization_id, reason, request_id, started_at, ended_at
    `;

    // Fire-and-forget — the practitioner ending their own session
    // shouldn't have to wait on an email send to get their response back.
    if (logRow) {
      (async () => {
        const [org] = await sql`SELECT name FROM organizations WHERE id = ${logRow.organization_id}`;
        const [practitioner] = await sql`SELECT email FROM practitioners WHERE id = ${payload.practitioner_id}`;
        const actions = await sql`
          SELECT method, path FROM impersonation_actions WHERE impersonation_log_id = ${payload.impersonation_log_id}
        `;
        await sendSessionSummaryEmail({
          practitionerEmail: practitioner?.email,
          orgName: org?.name || 'your',
          reason: logRow.reason,
          consentGiven: !!logRow.request_id,
          actionLabels: summarizeActions(actions),
          startedAt: logRow.started_at,
          endedAt: logRow.ended_at,
        });
      })().catch(err => console.error('Failed to send session summary:', err.message));
    }

    return res.json({ ok: true });
  }

  res.status(405).json({ error: 'Method not allowed' });
}
