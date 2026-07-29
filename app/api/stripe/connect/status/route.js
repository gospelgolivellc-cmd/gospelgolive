import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { stripe } from '@/lib/stripe';
import { requireUser } from '@/lib/auth';

// Called after the pastor exits the embedded onboarding component (finished
// or abandoned) — there's no server redirect to hang this off of like the
// old hosted flow had, so the client asks us to re-check the account
// directly. The account.updated webhook remains the source of truth for any
// status changes that happen later (e.g. delayed verification).
export async function POST() {
  const { user, error } = await requireUser('pastor');
  if (error) return error;

  const church = await prisma.church.findFirst({ where: { ownerId: user.sub } });
  if (!church?.stripeAccountId) {
    return NextResponse.json({ onboarded: false });
  }

  try {
    const account = await stripe.accounts.retrieve(church.stripeAccountId);
    const onboarded = Boolean(account.details_submitted && account.charges_enabled);

    await prisma.church.update({
      where: { id: church.id },
      data: { stripeOnboarded: onboarded },
    });

    return NextResponse.json({ onboarded });
  } catch (err) {
    console.error('Stripe Connect status check failed', err);
    return NextResponse.json({ error: 'Failed to check bank account status' }, { status: 500 });
  }
}
