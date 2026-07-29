import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { stripe } from '@/lib/stripe';
import { getPlan } from '@/lib/plans';
import { notifyChurchPaymentFailed, notifyChurchAccessSuspended } from '@/lib/notifications';

const DAY_MS = 24 * 60 * 60 * 1000;

// Vercel Cron (see vercel.json) hits this once daily. Runs the day-3 and
// day-7 steps of the dunning schedule that
// app/api/webhooks/stripe/route.js's handleInvoicePaymentFailed starts on
// day 0 — full timeline: day 0 first failure -> day 3 retry #1 -> day 7
// retry #2 (final, suspends access on failure). A retry that *succeeds* is
// picked up by the invoice.paid webhook (handleInvoicePaid), not here —
// this route only reacts to failure.
export async function GET(req) {
  const authHeader = req.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const now = Date.now();

  // Day 3: first retry. retryCount 0 = day-0 failure not yet retried.
  const day3Candidates = await prisma.church.findMany({
    where: { subscriptionStatus: 'past_due', retryCount: 0 },
  });
  let day3Attempted = 0;
  for (const church of day3Candidates) {
    if (now - new Date(church.paymentFailedAt).getTime() >= 3 * DAY_MS) {
      await attemptRetry(church, { attemptNumber: 2, isFinal: false });
      day3Attempted += 1;
    }
  }

  // Day 7: final retry. retryCount 1 = day-3 retry already failed once.
  const day7Candidates = await prisma.church.findMany({
    where: { subscriptionStatus: 'past_due', retryCount: 1 },
  });
  let day7Attempted = 0;
  for (const church of day7Candidates) {
    if (now - new Date(church.paymentFailedAt).getTime() >= 7 * DAY_MS) {
      await attemptRetry(church, { attemptNumber: 3, isFinal: true });
      day7Attempted += 1;
    }
  }

  return NextResponse.json({ ok: true, day3Attempted, day7Attempted });
}

async function attemptRetry(church, { attemptNumber, isFinal }) {
  if (!church.lastFailedInvoiceId) return;

  let invoice;
  try {
    invoice = await stripe.invoices.retrieve(church.lastFailedInvoiceId);
  } catch (err) {
    console.error(`Failed to retrieve invoice for retry (church ${church.id})`, err);
    return;
  }

  try {
    await stripe.invoices.pay(church.lastFailedInvoiceId);
    // Success is handled by the invoice.paid webhook — nothing else to do
    // here even on success (avoids a race between this route and that
    // webhook both writing the same "recovered" state).
  } catch {
    if (isFinal) {
      await prisma.church.update({
        where: { id: church.id },
        data: { subscriptionStatus: 'suspended', accessLockedAt: new Date(), retryCount: attemptNumber - 1 },
      });
      notifyChurchAccessSuspended(church).catch((e) => console.error('Failed to send access-suspended email', e));
    } else {
      await prisma.church.update({ where: { id: church.id }, data: { retryCount: attemptNumber - 1 } });
      notifyChurchPaymentFailed(church, {
        attemptNumber,
        amountCents: invoice.amount_due,
        planName: getPlan(church.plan).label,
      }).catch((e) => console.error('Failed to send payment-failed email', e));
    }
  }
}
