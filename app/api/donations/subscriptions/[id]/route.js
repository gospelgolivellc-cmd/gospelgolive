import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { stripe } from '@/lib/stripe';
import { requireUser } from '@/lib/auth';

const patchSchema = z.object({ action: z.enum(['pause', 'resume']) });

async function loadOwnedSubscription(id, userId) {
  const sub = await prisma.givingSubscription.findUnique({ where: { id } });
  if (!sub) return { error: NextResponse.json({ error: 'Recurring gift not found' }, { status: 404 }) };
  if (sub.giverId !== userId) {
    return { error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) };
  }
  return { sub };
}

// Pause or resume a seeker's own recurring gift. Pausing uses Stripe's
// native pause_collection('void') — no invoices are generated at all while
// paused, nothing to clean up manually, and resuming just clears it.
export async function PATCH(req, { params }) {
  const { user, error } = await requireUser('seeker');
  if (error) return error;

  let input;
  try {
    input = patchSchema.parse(await req.json());
  } catch (err) {
    return NextResponse.json({ error: 'Invalid request', details: err.errors }, { status: 400 });
  }

  const { id } = await params;
  const { sub, error: ownError } = await loadOwnedSubscription(id, user.sub);
  if (ownError) return ownError;

  if (input.action === 'pause') {
    if (sub.status !== 'active') {
      return NextResponse.json({ error: 'This recurring gift is not active.' }, { status: 400 });
    }
    try {
      await stripe.subscriptions.update(sub.stripeSubscriptionId, {
        pause_collection: { behavior: 'void' },
      });
      await prisma.givingSubscription.update({ where: { id }, data: { status: 'paused' } });
      return NextResponse.json({ status: 'paused' });
    } catch (err) {
      console.error('Failed to pause recurring gift', err);
      return NextResponse.json({ error: 'Failed to pause this recurring gift' }, { status: 500 });
    }
  }

  // resume
  if (sub.status !== 'paused') {
    return NextResponse.json({ error: 'This recurring gift is not paused.' }, { status: 400 });
  }
  try {
    await stripe.subscriptions.update(sub.stripeSubscriptionId, { pause_collection: '' });
    await prisma.givingSubscription.update({ where: { id }, data: { status: 'active' } });
    return NextResponse.json({ status: 'active' });
  } catch (err) {
    console.error('Failed to resume recurring gift', err);
    return NextResponse.json({ error: 'Failed to resume this recurring gift' }, { status: 500 });
  }
}

// Cancels a seeker's own recurring gift outright.
export async function DELETE(req, { params }) {
  const { user, error } = await requireUser('seeker');
  if (error) return error;

  const { id } = await params;
  const { sub, error: ownError } = await loadOwnedSubscription(id, user.sub);
  if (ownError) return ownError;

  if (sub.status === 'canceled') {
    return NextResponse.json({ error: 'This recurring gift is already canceled.' }, { status: 400 });
  }

  try {
    await stripe.subscriptions.cancel(sub.stripeSubscriptionId);
    await prisma.givingSubscription.update({
      where: { id },
      data: { status: 'canceled', canceledAt: new Date() },
    });
    return NextResponse.json({ status: 'canceled' });
  } catch (err) {
    console.error('Failed to cancel recurring gift', err);
    return NextResponse.json({ error: 'Failed to cancel this recurring gift' }, { status: 500 });
  }
}
