// lib/billingHistory.js — shared Stripe invoice + payment method lookup,
// used by both api/billing/invoices.js (a practitioner viewing their own
// org) and api/admin/invoices.js (a super-admin viewing any org). Kept in
// one place so the two surfaces can never quietly drift apart.
export async function getBillingHistory(stripe, stripeCustomerId) {
  if (!stripeCustomerId) {
    return { invoices: [], paymentMethod: null };
  }

  const [invoicesResp, customer] = await Promise.all([
    stripe.invoices.list({ customer: stripeCustomerId, limit: 24 }),
    stripe.customers.retrieve(stripeCustomerId, { expand: ['invoice_settings.default_payment_method'] }),
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
    const pms = await stripe.paymentMethods.list({ customer: stripeCustomerId, type: 'card', limit: 1 });
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

  return { invoices, paymentMethod };
}
