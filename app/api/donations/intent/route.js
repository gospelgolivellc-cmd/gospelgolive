import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { stripe } from '@/lib/stripe';
import { getCurrentUser } from '@/lib/auth';
import { getPlan, planHasFeature } from '@/lib/plans';
import { enforceGivingTwoFactor, setGivingTrustCookie } from '@/lib/givingTwoFactor';
import { getMonthlyGivingTotalCents, resumeStaleCapPauses } from '@/lib/givingCap';
import { logCapHit } from '@/lib/behaviorEmails';

const schema = z.object({
  churchSlug: z.string().min(1),
  amountCents: z.number().int().min(100), // $1 minimum
  note: z.string().max(280).optional(),
  fundId: z.string().uuid().optional(),
  // Set only when the client's own church.html view has an active live
  // stream at give-time — the one context exempt from mandatory 2FA (see
  // lib/givingTwoFactor.js). Verified server-side against a real Stream row,
  // not trusted at face value.
  streamId: z.string().uuid().optional(),
  twoFactorCode: z.string().min(6).max(10).optional(),
});

// One-time gift. Returns a PaymentIntent client_secret that the client
// confirms with Stripe Elements/Checkout. Hold-and-distribute model: the
// charge lands entirely on the platform's own Stripe balance (no
// transfer_data/application_fee here) — the church's net share (gross minus
// the plan-dependent platform fee, see lib/plans.js) is paid out separately
// via lib/payouts.js once the webhook confirms the charge succeeded.
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

  const amount = input.amountCents;
  const platformFee = Math.round(amount * plan.platformFeeRate);

  // Ministry+ giving funds. A fundId from any other church (or a stale or
  // deleted one) is silently dropped rather than rejected, the gift still
  // goes through, it just isn't tagged to a fund.
  let fundId = null;
  if (input.fundId && planHasFeature(church, 'giving_funds')) {
    const fund = await prisma.givingFund.findUnique({ where: { id: input.fundId } });
    if (fund && fund.churchId === church.id) fundId = fund.id;
  }

  try {
    const paymentIntent = await stripe.paymentIntents.create({
      amount,
      currency: 'usd',
      // Lets Stripe offer whatever the giver's browser/device supports —
      // cards, Apple Pay, Google Pay, Link, etc. — the same mix a normal
      // online checkout would show, instead of restricting to cards only.
      automatic_payment_methods: { enabled: true },
      metadata: {
        church_id: church.id,
        giver_id: giver.sub,
        note: input.note || '',
        fund_id: fundId || '',
        // Quoted once here rather than recomputed in the webhook, so the fee
        // actually charged always matches what the giver was shown, even if
        // the church's plan changes in the window between intent creation
        // and the webhook firing.
        platform_fee_cents: String(platformFee),
      },
    });

    const response = NextResponse.json({ clientSecret: paymentIntent.client_secret });
    return twoFactor.setTrust ? setGivingTrustCookie(response, giver.sub) : response;
  } catch (err) {
    console.error('Stripe donation payment intent failed', err);
    return NextResponse.json({ error: 'Failed to start payment' }, { status: 500 });
  }
}
