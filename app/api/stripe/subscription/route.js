import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { stripe } from '@/lib/stripe';
import { requireUser } from '@/lib/auth';
import { getPlanPriceId } from '@/lib/plans';

const schema = z.object({
  plan: z.enum(['ministry', 'congregation']),
  interval: z.enum(['month', 'year']).default('month'),
});

const ACTIVE_STATUSES = ['trialing', 'active', 'past_due'];

// Starts or changes a pastor's paid plan. If the church has no active
// subscription yet, creates one directly (no Checkout redirect) with a
// 14-day trial, so no card is required up front — matches "free for 14
// days" everywhere on the site. If the trial ends without a payment method
// on file, Stripe's invoice.payment_failed webhook marks the church
// past_due. If the church already has an active/trialing subscription
// (switching Ministry <-> Congregation), this instead updates that
// subscription's price in place with prorations, rather than creating a
// second subscription.
export async function POST(req) {
  const { user, error } = await requireUser('pastor');
  if (error) return error;

  let input;
  try {
    input = schema.parse(await req.json());
  } catch (err) {
    return NextResponse.json({ error: 'Invalid request', details: err.errors }, { status: 400 });
  }

  const church = await prisma.church.findFirst({ where: { ownerId: user.sub } });
  if (!church) {
    return NextResponse.json({ error: 'No church found for this account' }, { status: 404 });
  }

  if (church.plan === input.plan && church.billingInterval === input.interval) {
    return NextResponse.json({ error: 'Already on this plan' }, { status: 400 });
  }

  try {
    const hasActiveSubscription = church.stripeSubscriptionId && ACTIVE_STATUSES.includes(church.subscriptionStatus);
    const priceId = getPlanPriceId(input.plan, input.interval);

    if (hasActiveSubscription) {
      const subscription = await stripe.subscriptions.retrieve(church.stripeSubscriptionId);
      const currentItem = subscription.items.data[0];

      const updated = await stripe.subscriptions.update(church.stripeSubscriptionId, {
        items: [{ id: currentItem.id, price: priceId }],
        proration_behavior: 'create_prorations',
      });

      await prisma.church.update({
        where: { id: church.id },
        data: { plan: input.plan, billingInterval: input.interval, subscriptionStatus: updated.status },
      });

      return NextResponse.json({ subscriptionId: updated.id, status: updated.status });
    }

    let customerId = church.stripeCustomerId;
    if (!customerId) {
      const customer = await stripe.customers.create({
        email: user.email,
        name: church.name,
        metadata: { church_id: church.id },
      });
      customerId = customer.id;
    }

    await prisma.church.update({
      where: { id: church.id },
      data: { plan: input.plan, billingInterval: input.interval, stripeCustomerId: customerId },
    });

    const subscription = await stripe.subscriptions.create({
      customer: customerId,
      items: [{ price: priceId }],
      trial_period_days: 14,
    });

    await prisma.church.update({
      where: { id: church.id },
      data: {
        stripeSubscriptionId: subscription.id,
        subscriptionStatus: subscription.status,
      },
    });

    return NextResponse.json({ subscriptionId: subscription.id, status: subscription.status });
  } catch (err) {
    console.error('Stripe plan subscription failed', err);
    return NextResponse.json({ error: 'Failed to update subscription' }, { status: 500 });
  }
}

// Cancels a pastor's paid subscription and drops the church back to the
// Free plan, effective immediately (no prorated refund — matches how
// upgrades take effect immediately too). The customer.subscription.deleted
// webhook performs the same DB update independently, so this stays correct
// even if the synchronous update below races with or is skipped ahead of it.
export async function DELETE() {
  const { user, error } = await requireUser('pastor');
  if (error) return error;

  const church = await prisma.church.findFirst({ where: { ownerId: user.sub } });
  if (!church) {
    return NextResponse.json({ error: 'No church found for this account' }, { status: 404 });
  }

  if (!church.stripeSubscriptionId || church.plan === 'starter') {
    return NextResponse.json({ error: 'No active paid subscription to cancel' }, { status: 400 });
  }

  try {
    await stripe.subscriptions.cancel(church.stripeSubscriptionId);

    await prisma.church.update({
      where: { id: church.id },
      data: { plan: 'starter', billingInterval: null, subscriptionStatus: 'canceled', stripeSubscriptionId: null },
    });

    return NextResponse.json({ status: 'canceled' });
  } catch (err) {
    console.error('Stripe subscription cancellation failed', err);
    return NextResponse.json({ error: 'Failed to cancel subscription' }, { status: 500 });
  }
}
