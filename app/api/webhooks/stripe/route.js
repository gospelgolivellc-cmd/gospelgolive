import { NextResponse } from 'next/server';
import { stripe } from '@/lib/stripe';
import { prisma } from '@/lib/prisma';
import { ALL_PLAN_PRICE_IDS, getPlan } from '@/lib/plans';
import {
  notifyChurchDonation,
  notifyGiverGiftReceipt,
  notifyChurchPaymentFailed,
  notifyChurchAccessRestored,
  notifyChurchSubscriptionReceipt,
  notifyChurchSubscriptionCancelled,
  notifyChurchDispute,
  notifySeekerRecurringGiftFailed,
  notifySeekerRecurringGiftCancelled,
  notifyChurchIdentityVerified,
} from '@/lib/notifications';
import { transferDonationPayout, reverseDonationPayout } from '@/lib/payouts';
import { trackEvent } from '@/lib/posthogServer';
import { checkChurchGivingPatterns, checkGiverPatterns } from '@/lib/detectSuspiciousGiving';
import { pauseSubscriptionsIfCapReached } from '@/lib/givingCap';

export async function POST(req) {
  const signature = req.headers.get('stripe-signature');
  const rawBody = await req.text();

  let event;
  try {
    event = stripe.webhooks.constructEvent(rawBody, signature, process.env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    console.error('Stripe webhook signature verification failed', err.message);
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
  }

  try {
    switch (event.type) {
      case 'account.updated':
        await handleAccountUpdated(event.data.object);
        break;
      case 'payment_intent.succeeded':
        await handlePaymentIntentSucceeded(event.data.object);
        break;
      case 'invoice.paid':
        await handleInvoicePaid(event.data.object);
        break;
      case 'invoice.payment_failed':
        await handleInvoicePaymentFailed(event.data.object);
        break;
      case 'customer.subscription.deleted':
        await handleSubscriptionDeleted(event.data.object);
        break;
      case 'charge.refunded':
        await handleChargeRefunded(event.data.object);
        break;
      case 'charge.dispute.created':
        await handleChargeDisputeCreated(event.data.object);
        break;
      default:
        break;
    }
  } catch (err) {
    console.error(`Failed to handle Stripe event ${event.type}`, err);
    return NextResponse.json({ error: 'Webhook handler failed' }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}

function resolveGiverId(rawGiverId) {
  return rawGiverId && rawGiverId !== 'anonymous' ? rawGiverId : null;
}

// The webhook payload's `latest_charge`/`invoice.charge` fields are bare
// charge ids, not expanded objects — a fresh retrieve is needed to read
// payment_method_details.card.fingerprint off of it (same "re-fetch rather
// than trust the raw payload's shape" pattern handleInvoicePaid already uses
// above). Swallows failures — a missing fingerprint just means the
// card-testing heuristic in lib/detectSuspiciousGiving.js can't see this one
// donation, not a reason to fail the whole webhook.
async function getCardFingerprint(chargeId) {
  if (!chargeId) return null;
  try {
    const charge = await stripe.charges.retrieve(chargeId);
    return charge.payment_method_details?.card?.fingerprint || null;
  } catch (err) {
    console.error(`Failed to retrieve charge ${chargeId} for card fingerprint`, err.message);
    return null;
  }
}

// Fires the Trust & Safety financial-crime checks right after a donation is
// recorded — cheap, scoped to one church/giver, and complements the daily
// sweep (app/api/cron/fraud-review) which catches multi-day patterns a
// single transaction can't see on its own.
function runFraudChecks(donation) {
  checkChurchGivingPatterns(donation.churchId).catch((e) => console.error('Church fraud-pattern check failed', e));
  if (donation.giverId) {
    checkGiverPatterns(donation.giverId).catch((e) => console.error('Giver fraud-pattern check failed', e));
  }
}

// Run right after a donation is recorded, one-time or recurring. Contained
// in its own try/catch (rather than letting a failure bubble up and fail
// the whole webhook) since the Donation row this church's monthly total
// depends on is already safely committed by this point — a retry of the
// whole event would just skip past the idempotency check above and never
// reach this again, silently leaving the cap unchecked.
async function checkGivingCapAfterDonation(churchId) {
  try {
    await pauseSubscriptionsIfCapReached(churchId);
  } catch (err) {
    console.error('Failed to check/pause giving subscriptions at cap', churchId, err);
  }
}

// Connect account finished (or lost) verification — this is the source of
// truth for stripe_onboarded; the client-side status check after the
// embedded onboarding component closes only gives immediate UI feedback.
async function handleAccountUpdated(account) {
  const onboarded = Boolean(account.details_submitted && account.charges_enabled);
  const church = await prisma.church.findFirst({ where: { stripeAccountId: account.id } });
  if (!church) return;

  await prisma.church.update({ where: { id: church.id }, data: { stripeOnboarded: onboarded } });

  // Only on the false -> true transition, not every account.updated event
  // (Stripe sends these frequently for unrelated field changes too).
  if (onboarded && !church.stripeOnboarded) {
    notifyChurchIdentityVerified(church).catch((e) => console.error('Failed to send identity-verified email', e));
  }
}

// One-time gift confirmed via Stripe Elements against the PaymentIntent
// created in /api/donations/intent. Hold-and-distribute model: the charge
// landed on the platform's own balance (no transfer_data there), so once
// the Donation row is recorded we separately transfer the church's net
// share out to their connected account.
async function handlePaymentIntentSucceeded(paymentIntent) {
  const churchId = paymentIntent.metadata?.church_id;
  if (!churchId) return; // not a donation payment intent (e.g. unrelated charge)

  // Stripe delivers webhooks at-least-once — only notify on the row's first
  // creation, not on a retried delivery of the same event.
  const existing = await prisma.donation.findUnique({
    where: { stripePaymentIntentId: paymentIntent.id },
    select: { id: true },
  });
  if (existing) return;

  const church = await prisma.church.findUnique({
    where: { id: churchId },
    select: { name: true, plan: true, stripeAccountId: true, businessType: true, verificationStatus: true },
  });
  const amountCents = paymentIntent.amount;
  // platform_fee_cents was quoted at PaymentIntent creation time using the
  // church's plan-aware rate (see app/api/donations/intent/route.js) — this
  // fallback only matters for edge cases where that metadata is somehow
  // missing.
  const platformFeeCents = paymentIntent.metadata.platform_fee_cents
    ? parseInt(paymentIntent.metadata.platform_fee_cents, 10)
    : Math.round(amountCents * getPlan(church?.plan).platformFeeRate);

  const cardFingerprint = await getCardFingerprint(paymentIntent.latest_charge);

  const donation = await prisma.donation.create({
    data: {
      churchId,
      giverId: resolveGiverId(paymentIntent.metadata.giver_id),
      amountCents,
      platformFeeCents,
      netCents: amountCents - platformFeeCents,
      isRecurring: false,
      stripePaymentIntentId: paymentIntent.id,
      note: paymentIntent.metadata.note || null,
      fundId: paymentIntent.metadata.fund_id || null,
      cardFingerprint,
    },
  });
  notifyChurchDonation(donation).catch((e) => console.error('Failed to notify church of donation', e));
  if (church) notifyGiverGiftReceipt(donation, church).catch((e) => console.error('Failed to send gift receipt email', e));
  trackEvent(donation.giverId || 'anonymous', 'donation_completed', {
    churchId: donation.churchId,
    amountCents: donation.amountCents,
    isRecurring: false,
  }).catch((e) => console.error('Failed to track donation event', e));
  runFraudChecks(donation);
  await checkGivingCapAfterDonation(churchId);
  if (church) await transferDonationPayout(donation, church, paymentIntent.latest_charge);
}

async function handleInvoicePaid(rawInvoice) {
  // The raw webhook payload's shape depends on whichever API version the
  // sending endpoint (or account default, for CLI-forwarded events) is
  // pinned to — Stripe removed `subscription`/`charge`/`payment_intent` as
  // direct Invoice fields in newer API versions (replaced by `parent`/
  // `payments`). Re-fetch via our own SDK call instead of trusting the
  // webhook payload's shape directly: this app's Stripe client always
  // requests its own pinned (older) API version for outgoing calls
  // regardless of what version the incoming event arrived in, so these
  // fields are reliably present on the re-fetched copy.
  const invoice = await stripe.invoices.retrieve(rawInvoice.id);
  if (!invoice.subscription) return;

  // Plan subscription (pastor's monthly/annual fee) branch — no-ops (church
  // stays null) unless this invoice's subscription belongs to a church.
  const planChurch = await prisma.church.findFirst({ where: { stripeSubscriptionId: invoice.subscription } });
  if (planChurch) {
    // Distinguish "recovering from a failed payment" (day-0/3/7 dunning —
    // see handleInvoicePaymentFailed below) from "just another normal
    // monthly charge" so we send the right email for each, not both.
    const wasFailing = planChurch.subscriptionStatus !== 'active';

    await prisma.church.update({
      where: { id: planChurch.id },
      data: {
        subscriptionStatus: 'active',
        paymentFailedAt: null,
        retryCount: 0,
        accessLockedAt: null,
        lastFailedInvoiceId: null,
      },
    });

    if (wasFailing) {
      notifyChurchAccessRestored(planChurch, invoice.amount_paid).catch((e) =>
        console.error('Failed to send access-restored email', e)
      );
    } else {
      const planSubscription = await stripe.subscriptions.retrieve(invoice.subscription);
      notifyChurchSubscriptionReceipt(planChurch, {
        amountCents: invoice.amount_paid,
        planName: getPlan(planChurch.plan).label,
        nextBillingDate: new Date(planSubscription.current_period_end * 1000),
      }).catch((e) => console.error('Failed to send subscription receipt email', e));
    }
  }

  const subscription = await stripe.subscriptions.retrieve(invoice.subscription);
  const priceId = subscription.items.data[0]?.price?.id;
  const isPlanSubscription = ALL_PLAN_PRICE_IDS.includes(priceId);
  if (isPlanSubscription) return;

  // Otherwise this is a recurring donation subscription.
  const churchId = subscription.metadata?.church_id;
  if (!churchId) return;

  const existing = await prisma.donation.findUnique({
    where: { stripeInvoiceId: invoice.id },
    select: { id: true },
  });
  if (existing) return;

  // Looked up fresh on every charge (not fixed at subscription-creation
  // time) so the fee always tracks the church's current plan, even if they
  // upgrade/downgrade between recurring charges.
  const church = await prisma.church.findUnique({
    where: { id: churchId },
    select: { name: true, plan: true, stripeAccountId: true, businessType: true, verificationStatus: true },
  });
  const amountCents = invoice.amount_paid;
  const platformFeeCents = Math.round(amountCents * getPlan(church?.plan).platformFeeRate);

  const cardFingerprint = await getCardFingerprint(invoice.charge);

  const donation = await prisma.donation.create({
    data: {
      churchId,
      giverId: resolveGiverId(subscription.metadata.giver_id),
      amountCents,
      platformFeeCents,
      netCents: amountCents - platformFeeCents,
      isRecurring: true,
      stripeSubscriptionId: subscription.id,
      stripeInvoiceId: invoice.id,
      // Not set at subscription-creation (no PaymentIntent exists yet at
      // that point) — this is the per-charge PaymentIntent Stripe generates
      // for each invoice, and doubles as the refund-matching key in
      // handleChargeRefunded/handleChargeDisputeCreated below.
      stripePaymentIntentId: invoice.payment_intent || null,
      note: subscription.metadata.note || null,
      fundId: subscription.metadata.fund_id || null,
      cardFingerprint,
    },
  });
  notifyChurchDonation(donation).catch((e) => console.error('Failed to notify church of donation', e));
  if (church) notifyGiverGiftReceipt(donation, church).catch((e) => console.error('Failed to send gift receipt email', e));
  trackEvent(donation.giverId || 'anonymous', 'donation_completed', {
    churchId: donation.churchId,
    amountCents: donation.amountCents,
    isRecurring: true,
  }).catch((e) => console.error('Failed to track donation event', e));
  runFraudChecks(donation);
  await checkGivingCapAfterDonation(churchId);
  // Hold-and-distribute model: this charge landed on the platform's own
  // balance (no transfer_data on the subscription), pay the church's net
  // share out separately.
  if (church) await transferDonationPayout(donation, church, invoice.charge);
}

// Day 0 of the payment-retry/access-lock dunning schedule — see
// app/api/cron/subscription-retries/route.js for the day-3/day-7 follow-up
// and lib/checkAccess.js for what 'suspended' actually blocks.
async function handleInvoicePaymentFailed(rawInvoice) {
  // Same version-drift concern as handleInvoicePaid above — re-fetch fresh
  // rather than trusting the raw webhook payload's `subscription` field.
  const invoice = await stripe.invoices.retrieve(rawInvoice.id);
  if (!invoice.subscription) return;

  const church = await prisma.church.findFirst({ where: { stripeSubscriptionId: invoice.subscription } });
  if (church) {
    // Only start the dunning clock on a genuine first failure — Stripe
    // delivers webhooks at-least-once, and this also stops a second,
    // unrelated invoice failure from resetting an already-running timer.
    if (['active', 'trialing'].includes(church.subscriptionStatus)) {
      await prisma.church.update({
        where: { id: church.id },
        data: {
          subscriptionStatus: 'past_due',
          paymentFailedAt: new Date(),
          retryCount: 0,
          lastFailedInvoiceId: invoice.id,
        },
      });
      notifyChurchPaymentFailed(church, {
        attemptNumber: 1,
        amountCents: invoice.amount_due,
        planName: getPlan(church.plan).label,
      }).catch((e) => console.error('Failed to send payment-failed email', e));
    }
    return;
  }

  // Not a plan subscription — check whether it's a recurring donation
  // subscription instead. No retry schedule for these (out of scope per the
  // payment-retry spec, which covers pastor subscription billing only);
  // just notify the giver immediately.
  const givingSub = await prisma.givingSubscription.findFirst({ where: { stripeSubscriptionId: invoice.subscription } });
  if (givingSub) {
    notifySeekerRecurringGiftFailed(givingSub).catch((e) => console.error('Failed to send recurring-gift-failed email', e));
  }
}

async function handleSubscriptionDeleted(subscription) {
  // Plan subscription branch — capture the prior plan before resetting it so
  // the cancellation email can name what was actually cancelled. Guarded on
  // not-already-canceled so a duplicate webhook delivery doesn't double-send.
  const church = await prisma.church.findFirst({ where: { stripeSubscriptionId: subscription.id } });
  if (church && church.subscriptionStatus !== 'canceled') {
    const planName = getPlan(church.plan).label;
    await prisma.church.update({
      where: { id: church.id },
      data: { subscriptionStatus: 'canceled', plan: 'starter', billingInterval: null },
    });
    notifyChurchSubscriptionCancelled(church, {
      planName,
      endDate: new Date(subscription.current_period_end * 1000),
    }).catch((e) => console.error('Failed to send subscription-cancelled email', e));
  }

  // Donation subscription branch — covers Stripe canceling it directly (e.g.
  // repeated payment failures exhausting retries), not just our own DELETE
  // /api/donations/subscriptions/[id] route. This webhook is the single
  // source of truth for the email, so a self-service cancel (which already
  // writes this same status synchronously but doesn't email) won't double-send
  // once this event arrives moments later.
  const givingSub = await prisma.givingSubscription.findFirst({ where: { stripeSubscriptionId: subscription.id } });
  if (givingSub && givingSub.status !== 'canceled') {
    await prisma.givingSubscription.update({
      where: { id: givingSub.id },
      data: { status: 'canceled', canceledAt: new Date() },
    });
    notifySeekerRecurringGiftCancelled(givingSub).catch((e) => console.error('Failed to send recurring-gift-cancelled email', e));
  }
}

// A gift (one-time or a single recurring charge) was refunded, in full or in
// part. charge.payment_intent doubles as the donation lookup key for both
// donation types (see handlePaymentIntentSucceeded / handleInvoicePaid).
// Not a donation charge (e.g. a plan-subscription payment) → no matching
// row, no-op.
async function handleChargeRefunded(charge) {
  if (!charge.payment_intent) return;
  const donation = await prisma.donation.findUnique({ where: { stripePaymentIntentId: charge.payment_intent } });
  if (!donation) return;

  // charge.amount_refunded is the running cumulative total, not this
  // event's delta — scale it onto the net share we actually paid out so a
  // full refund claws back the church's entire share, and a partial refund
  // claws back its proportional share. reverseDonationPayout compares
  // against donation.reversedCents, so this is safe to call again for
  // every subsequent partial refund and for retried webhook deliveries.
  const targetTotalReversedCents = Math.round((charge.amount_refunded / charge.amount) * donation.netCents);
  await reverseDonationPayout(donation, targetTotalReversedCents);
}

// A cardholder disputed a gift — Stripe withdraws the disputed amount from
// the platform's balance immediately (before the dispute is resolved), so we
// claw back the church's proportional share the same way as a refund. If the
// dispute is later won and Stripe returns the funds, that's not reversed
// back out to the church automatically — treated as an accepted gap, since
// disputes on small-dollar donations are rare and this can be resolved
// manually via the Stripe Dashboard if it happens.
async function handleChargeDisputeCreated(dispute) {
  if (!dispute.payment_intent) return;
  const donation = await prisma.donation.findUnique({ where: { stripePaymentIntentId: dispute.payment_intent } });
  if (!donation) return;

  const targetTotalReversedCents = Math.round((dispute.amount / donation.amountCents) * donation.netCents);
  await reverseDonationPayout(donation, targetTotalReversedCents);

  notifyChurchDispute(donation, dispute).catch((e) => console.error('Failed to send dispute-filed email', e));
}
