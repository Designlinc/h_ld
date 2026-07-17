// api/account/index.js — the practitioner's own account settings, distinct
// from api/settings (which is business/org-level: hours, branding, etc.)
import sql from '../../lib/db.js';
import { requireAuth } from '../../lib/auth.js';
import { requireOrg } from '../../lib/tenant.js';
import bcrypt from 'bcryptjs';

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') return res.status(200).end();

  const org = await requireOrg(req, res);
  if (!org) return;
  const auth = requireAuth(req, res, org);
  if (!auth) return;

  if (req.method === 'GET') {
    const [practitioner] = await sql`
      SELECT email, name, notifications_opt_out FROM practitioners WHERE id = ${auth.practitioner_id}
    `;
    const [orgRow] = await sql`
      SELECT plan_tier, billing_status, stripe_status, stripe_customer_id
      FROM organizations WHERE id = ${org.id}
    `;
    return res.json({
      email: practitioner.email,
      name: practitioner.name,
      notificationsOptOut: practitioner.notifications_opt_out,
      role: auth.role,
      organization: {
        name: org.name,
        planTier: orgRow.plan_tier,
        billingStatus: orgRow.billing_status,
        stripeStatus: orgRow.stripe_status,
        hasBillingAccount: !!orgRow.stripe_customer_id,
      },
    });
  }

  if (req.method === 'PUT') {
    const { email, notificationsOptOut, currentPassword } = req.body || {};
    const updates = [];

    if (email !== undefined) {
      if (!currentPassword) {
        return res.status(400).json({ error: 'Current password required to change email' });
      }
      const [practitioner] = await sql`SELECT password FROM practitioners WHERE id = ${auth.practitioner_id}`;
      const valid = await bcrypt.compare(currentPassword, practitioner.password);
      if (!valid) return res.status(401).json({ error: 'Current password is incorrect' });

      const normalizedEmail = email.trim().toLowerCase();
      const [existing] = await sql`SELECT id FROM practitioners WHERE email = ${normalizedEmail} AND id != ${auth.practitioner_id}`;
      if (existing) return res.status(409).json({ error: 'That email is already in use' });

      await sql`UPDATE practitioners SET email = ${normalizedEmail} WHERE id = ${auth.practitioner_id}`;
    }

    if (notificationsOptOut !== undefined) {
      await sql`UPDATE practitioners SET notifications_opt_out = ${!!notificationsOptOut} WHERE id = ${auth.practitioner_id}`;
    }

    return res.json({ ok: true });
  }

  if (req.method === 'POST') {
    const { action, currentPassword, newPassword } = req.body || {};

    if (action === 'change_password') {
      if (!currentPassword || !newPassword) {
        return res.status(400).json({ error: 'Current and new password required' });
      }
      if (newPassword.length < 8) {
        return res.status(400).json({ error: 'New password must be at least 8 characters' });
      }
      const [practitioner] = await sql`SELECT password FROM practitioners WHERE id = ${auth.practitioner_id}`;
      const valid = await bcrypt.compare(currentPassword, practitioner.password);
      if (!valid) return res.status(401).json({ error: 'Current password is incorrect' });

      const passwordHash = await bcrypt.hash(newPassword, 12);
      await sql`UPDATE practitioners SET password = ${passwordHash} WHERE id = ${auth.practitioner_id}`;
      return res.json({ ok: true });
    }

    return res.status(400).json({ error: 'Unknown action' });
  }

  res.status(405).json({ error: 'Method not allowed' });
}
