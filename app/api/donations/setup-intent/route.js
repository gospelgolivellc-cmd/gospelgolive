import { NextResponse } from 'next/server';
import { stripe } from '@/lib/stripe';
import { getCurrentUser } from '@/lib/auth';

// Step 1 of starting a recurring gift. Stripe.js's deferred Setup Elements
// (`stripe.elements({ mode: 'setup' })`) still requires a real SetupIntent's
// clientSecret before `stripe.confirmSetup()` will do anything — it throws
// "You must pass in a clientSecret" otherwise. Mirrors how the one-time gift
// flow (/api/donations/intent) creates a real PaymentIntent up front for the
// same reason. The resulting customer is reused (not recreated) by
// /api/donations/subscription once the card is confirmed, so the confirmed
// payment method and the subscription end up on the same Stripe Customer.
export async function POST() {
  const giver = await getCurrentUser();
  if (!giver) {
    return NextResponse.json({ error: 'Please sign in to give.', code: 'SIGN_IN_REQUIRED' }, { status: 401 });
  }

  try {
    const customer = await stripe.customers.create({ email: giver.email });
    const setupIntent = await stripe.setupIntents.create({ customer: customer.id });

    return NextResponse.json({ clientSecret: setupIntent.client_secret, customerId: customer.id });
  } catch (err) {
    console.error('Stripe setup intent creation failed', err);
    return NextResponse.json({ error: 'Failed to start card setup' }, { status: 500 });
  }
}
