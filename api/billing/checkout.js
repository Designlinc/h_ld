// api/billing/checkout.js — starts a Stripe Checkout session for the org's subscription
import sql from '../../lib/db.js';
import { requireAuth } from '../../lib/auth.js';
import { requireOrg } from '../../lib/tenant.js';
import { requireStripe } from '../../lib/stripe.js';

const PRICE_ID = process.env.STRIPE_PRICE_ID;

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const org = await requireOrg(req, res);
  if (!org) return;
  const auth = requireAuth(req, res, org);
  if (!auth) return;

  const stripe = requireStripe(res);
  if (!stripe) return;
  if (!PRICE_ID) return res.status(500).json({ error: 'STRIPE_PRICE_ID not configured' });

  const [orgRow] = await sql`SELECT stripe_customer_id, name FROM organizations WHERE id = ${org.id}`;

  let customerId = orgRow.stripe_customer_id;
  if (!customerId) {
    const customer = await stripe.customers.create({
      name: orgRow.name,
      email: auth.email,
      metadata: { organization_id: org.id },
    });
    customerId = customer.id;
    await sql`UPDATE organizations SET stripe_customer_id = ${customerId} WHERE id = ${org.id}`;
  }

  const session = await stripe.checkout.sessions.create({
    customer: customerId,
    mode: 'subscription',
    line_items: [{ price: PRICE_ID, quantity: 1 }],
    success_url: `https://${org.subdomain}.h-ld.com/?billing=success`,
    cancel_url: `https://${org.subdomain}.h-ld.com/?billing=cancelled`,
    metadata: { organization_id: org.id },
  });

  return res.json({ url: session.url });
}
