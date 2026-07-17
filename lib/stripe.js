// lib/stripe.js — Stripe SDK connection
import Stripe from 'stripe';

const stripe = process.env.STRIPE_SECRET_KEY
  ? new Stripe(process.env.STRIPE_SECRET_KEY)
  : null;

export default stripe;

export function requireStripe(res) {
  if (!stripe) {
    res.status(500).json({ error: 'Billing is not configured on this server' });
    return null;
  }
  return stripe;
}
