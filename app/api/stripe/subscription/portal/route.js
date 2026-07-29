import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { stripe } from '@/lib/stripe';
import { requireUser } from '@/lib/auth';

// Powers the "Manage Plan" button in pastor settings — hands off to
// Stripe's hosted billing portal for plan changes, invoices, and cancellation.
export async function POST() {
  const { user, error } = await requireUser('pastor');
  if (error) return error;

  const church = await prisma.church.findFirst({ where: { ownerId: user.sub } });
  if (!church?.stripeCustomerId) {
    return NextResponse.json({ error: 'No billing account on file' }, { status: 404 });
  }

  try {
    const session = await stripe.billingPortal.sessions.create({
      customer: church.stripeCustomerId,
      return_url: `${process.env.NEXT_PUBLIC_APP_URL}/dashboard/settings`,
    });

    return NextResponse.json({ url: session.url });
  } catch (err) {
    console.error('Stripe billing portal failed', err);
    return NextResponse.json({ error: 'Failed to open billing portal' }, { status: 500 });
  }
}
