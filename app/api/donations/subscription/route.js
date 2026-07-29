import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { stripe } from '@/lib/stripe';
import { getCurrentUser } from '@/lib/auth';
import { getPlan, planHasFeature } from '@/lib/plans';
import { trackEvent } from '@/lib/posthogServer';
import { enforceGivingTwoFactor, setGivingTrustCookie } from '@/lib/givingTwoFactor';
import { getMonthlyGivingTotalCents, resumeStaleCapPauses } from '@/lib/givingCap';
import { logCapHit } from '@/lib/behaviorEmails';

const schema = z.object({
  churchSlug: z.string().min(1),
  amountCents: z.number().int().min(100),
  paymentMethodId: z.string().min(1),
  // Comes from /api/donations/setup-intent — the same Customer the client
  // just confirmed a SetupIntent (and therefore this paymentMethodId)
  // against, so it must be reused rather than creating a second Customer.
  customerId: z.string().min(1),
  note: z.string().max(280).optional(),
  fundId: z.string().uuid().optional(),
  // Set only when the client's own church.html view has an active live
  // stream at give-time — the one context exempt from mandatory 2FA (see
  // lib/givingTwoFactor.js). Verified server-side against a real Stream row,
  // not trusted at face value.
  streamId: z.string().uuid().optional(),
  twoFactorCode: z.string().min(6).max(10).optional(),
});

// Recurring monthly gift. Not covered by an exact design snippet — built to
// match the one-time donation pattern above. The client collects a card via
// /api/donations/setup-intent + Stripe Elements first, then hands the
// resulting paymentMethodId/customerId here to start the subscription.
// Hold-and-distribute model: each invoice charge lands on the platform's own
// balance (no transfer_data/application_fee_percent here) — the church's net
// share for each charge is paid out separately via lib/payouts.js from the
// invoice.paid webhook.
export async function POST(req) {
  let input;
  try {
    input = schema.parse(await req.json());
  } catch (err) {
    return NextResponse.json({ error: 'Invalid request', details: err.errors }, { status: 400 });
  }

  const church = await prisma.church.findUnique({ where: { slug: input.churchSlug } });
  if (!church) {
    return NextResponse.json({ error: 'Church not found' }, { status: 404 });
  }
  if (!church.stripeOnboarded || !church.stripeAccountId) {
    return NextResponse.json(
      { error: 'This church has not finished setting up giving yet' },
      { status: 400 }
    );
  }

  const giver = await getCurrentUser();
  if (!giver) {
    return NextResponse.json({ error: 'Please sign in to give.', code: 'SIGN_IN_REQUIRED' }, { status: 401 });
  }
  const follow = await prisma.follow.findUnique({
    where: { seekerId_churchId: { seekerId: giver.sub, churchId: church.id } },
  });
  if (!follow) {
    return NextResponse.json(
      { error: 'Follow this church before giving.', code: 'FOLLOW_REQUIRED' },
      { status: 403 }
    );
  }

  const twoFactor = await enforceGivingTwoFactor({
    req,
    giverId: giver.sub,
    churchId: church.id,
    streamId: input.streamId,
    code: input.twoFactorCode,
  });
  if (!twoFactor.ok) return twoFactor.response;

  const plan = getPlan(church.plan);

  if (!plan.allowRecurringGiving) {
    return NextResponse.json(
      { error: "Recurring giving is not available on this church's current plan.", code: 'RECURRING_NOT_ALLOWED' },
      { status: 403 }
    );
  }

  if (plan.monthlyGivingCapCents !== null) {
    await resumeStaleCapPauses(church.id);
    const currentMonthTotal = await getMonthlyGivingTotalCents(church.id);
    if (currentMonthTotal + input.amountCents > plan.monthlyGivingCapCents) {
      const remainingCents = Math.max(0, plan.monthlyGivingCapCents - currentMonthTotal);
      logCapHit(church.id, 'giving').catch((err) => console.error('Failed to log giving cap hit', err));
      return NextResponse.json(
        {
          error: `This gift would exceed the church's monthly giving limit. $${(remainingCents / 100).toFixed(2)} remaining this month.`,
          code: 'MONTHLY_CAP_EXCEEDED',
          remainingCents,
        },
        { status: 403 }
      );
    }
  }

  let fundId = null;
  if (input.fundId && planHasFeature(church, 'giving_funds')) {
    const fund = await prisma.givingFund.findUnique({ where: { id: input.fundId } });
    if (fund && fund.churchId === church.id) fundId = fund.id;
  }

  try {
    // The customer already exists — created by /api/donations/setup-intent,
    // and the confirmed SetupIntent already attached this paymentMethodId to
    // it. Just make it the default for future invoices.
    await stripe.customers.update(input.customerId, {
      invoice_settings: { default_payment_method: input.paymentMethodId },
    });

    // Subscription line items only accept an existing Product id (no inline
    // product_data like Checkout/Invoice line items allow) — the Price
    // creation endpoint does support inline product_data, so create the
    // custom-amount Price there first and reference it by id below.
    const price = await stripe.prices.create({
      currency: 'usd',
      unit_amount: input.amountCents,
      recurring: { interval: 'month' },
      product_data: { name: `Monthly gift to ${church.name}` },
    });

    const subscription = await stripe.subscriptions.create({
      customer: input.customerId,
      items: [{ price: price.id }],
      default_payment_method: input.paymentMethodId,
      metadata: {
        church_id: church.id,
        giver_id: giver.sub,
        note: input.note || '',
        fund_id: fundId || '',
      },
      expand: ['latest_invoice.payment_intent'],
    });

    const paymentIntent = subscription.latest_invoice?.payment_intent;

    // Written synchronously (not waiting on the invoice.paid webhook) so the
    // seeker sees this in "Your Recurring Gifts" immediately — this is the
    // only row that tracks whether the subscription is still active, distinct
    // from the per-charge Donation rows the webhook creates on each invoice.
    await prisma.givingSubscription.create({
      data: {
        churchId: church.id,
        giverId: giver.sub,
        stripeSubscriptionId: subscription.id,
        amountCents: input.amountCents,
        fundId,
        note: input.note || null,
      },
    });

    trackEvent(giver.sub, 'recurring_gift_started', {
      churchId: church.id,
      amountCents: input.amountCents,
    }).catch((err) => console.error('Failed to track recurring gift event', err));

    const response = NextResponse.json({
      subscriptionId: subscription.id,
      clientSecret: paymentIntent?.client_secret ?? null,
    });
    return twoFactor.setTrust ? setGivingTrustCookie(response, giver.sub) : response;
  } catch (err) {
    console.error('Stripe recurring donation failed', err);
    return NextResponse.json({ error: 'Failed to start subscription' }, { status: 500 });
  }
}
