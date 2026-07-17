// api/billing/invoices.js — invoice history + payment method, for native
// in-app display. The portal (portal.js) still handles actually updating
// the card — that's a materially bigger build to replace (Stripe Elements
// + SetupIntent + 3D Secure handling), so it stays a portal redirect for
// now while everything read-only moves in-app.
import sql from '../../lib/db.js';
import { requireAuth } from '../../lib/auth.js';
import { requireOrg } from '../../lib/tenant.js';
import { requireStripe } from '../../lib/stripe.js';

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const org = await requireOrg(req, res);
  if (!org) return;
  const auth = requireAuth(req, res, org);
  if (!auth) return;

  const stripe = requireStripe(res);
  if (!stripe) return;

  const [orgRow] = await sql`SELECT stripe_customer_id FROM organizations WHERE id = ${org.id}`;
  if (!orgRow.stripe_customer_id) {
    return res.json({ invoices: [], paymentMethod: null });
  }

  const [invoicesResp, customer] = await Promise.all([
    stripe.invoices.list({ customer: orgRow.stripe_customer_id, limit: 24 }),
    stripe.customers.retrieve(orgRow.stripe_customer_id, { expand: ['invoice_settings.default_payment_method'] }),
  ]);

  const invoices = invoicesResp.data.map(inv => ({
    id: inv.id,
    number: inv.number,
    date: inv.created ? new Date(inv.created * 1000).toISOString() : null,
    amount: inv.amount_paid / 100,
    currency: (inv.currency || 'usd').toUpperCase(),
    status: inv.status,
    hostedUrl: inv.hosted_invoice_url,
    pdfUrl: inv.invoice_pdf,
  }));

  // Prefer the customer's default payment method; fall back to the first
  // card on file if no default is explicitly set (common when a customer
  // was created via Checkout without an explicit invoice_settings update).
  let pm = customer.deleted ? null : customer.invoice_settings?.default_payment_method;
  if (!pm) {
    const pms = await stripe.paymentMethods.list({ customer: orgRow.stripe_customer_id, type: 'card', limit: 1 });
    pm = pms.data[0] || null;
  }

  let paymentMethod = null;
  if (pm && pm.card) {
    paymentMethod = {
      brand: pm.card.brand,
      last4: pm.card.last4,
      expMonth: pm.card.exp_month,
      expYear: pm.card.exp_year,
    };
  }

  return res.json({ invoices, paymentMethod });
}
