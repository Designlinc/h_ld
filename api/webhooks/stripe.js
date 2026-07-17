// api/webhooks/stripe.js — syncs Stripe subscription events to organizations
import sql from '../../lib/db.js';
import stripe from '../../lib/stripe.js';

// Stripe signs the exact raw bytes it sent, same reasoning as the Square
// webhook — body parsing must be disabled so we verify against untouched
// bytes, not a re-serialized copy that could differ and break the signature.
function getRawBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (chunk) => { data += chunk; });
    req.on('end', () => resolve(data));
    req.on('error', reject);
  });
}

export const config = { api: { bodyParser: false } };

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();
  if (!stripe) return res.status(500).json({ error: 'Billing not configured' });

  const rawBody = await getRawBody(req);
  const signature = req.headers['stripe-signature'];

  let event;
  try {
    event = stripe.webhooks.constructEvent(rawBody, signature, process.env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    console.error('Stripe webhook signature verification failed:', err.message);
    return res.status(400).json({ error: 'Invalid signature' });
  }

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object;
        const organizationId = session.metadata?.organization_id;
        if (organizationId && session.subscription) {
          await sql`
            UPDATE organizations
            SET stripe_customer_id = ${session.customer},
                stripe_subscription_id = ${session.subscription},
                billing_status = 'active'
            WHERE id = ${organizationId}
          `;
        }
        break;
      }

      case 'customer.subscription.updated': {
        const sub = event.data.object;
        await sql`
          UPDATE organizations
          SET stripe_status = ${sub.status}
          WHERE stripe_subscription_id = ${sub.id}
        `;
        break;
      }

      case 'customer.subscription.deleted': {
        const sub = event.data.object;
        // The one case that actually gates access — subscription is
        // genuinely gone, not just temporarily past_due (which we
        // deliberately don't act on here, to give a payment-failure grace
        // period rather than locking someone out over one failed charge).
        await sql`
          UPDATE organizations
          SET stripe_status = ${sub.status}, billing_status = 'cancelled'
          WHERE stripe_subscription_id = ${sub.id}
        `;
        break;
      }

      default:
        // Other event types are received but intentionally not acted on.
        break;
    }

    return res.json({ received: true });
  } catch (err) {
    console.error('Stripe webhook handler error:', err.message);
    // Still 200 — a DB hiccup here shouldn't make Stripe endlessly retry
    // and pile up duplicate webhook deliveries. Logged for manual follow-up.
    return res.status(200).json({ received: true, warning: 'processing error logged' });
  }
}
