import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { stripe } from '@/lib/stripe';
import { requireUser } from '@/lib/auth';

// Starts (or resumes) Stripe Connect Express onboarding for the signed-in
// pastor's church, so they can receive donation payouts to their own bank.
// Returns an Account Session client_secret for Stripe Connect embedded
// components — the pastor completes onboarding inline on our own dashboard,
// never redirected to a stripe.com hosted page, and goes straight into
// Stripe's own onboarding form with no custom questions of our own first.
export async function POST() {
  const { user, error } = await requireUser('pastor');
  if (error) return error;

  const church = await prisma.church.findFirst({ where: { ownerId: user.sub } });
  if (!church) {
    return NextResponse.json({ error: 'No church found for this account' }, { status: 404 });
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL;
  // Stripe requires business_profile.url to be a real, publicly-resolvable
  // address — it rejects localhost URLs outright, so omit it in local dev
  // rather than sending a value guaranteed to fail account creation.
  const isPublicUrl = /^https?:\/\/(?!localhost|127\.0\.0\.1)/i.test(appUrl);

  try {
    let accountId = church.stripeAccountId;

    if (!accountId) {
      const account = await stripe.accounts.create({
        type: 'express',
        country: 'US',
        email: user.email,
        // business_type deliberately left unset — Stripe's own embedded
        // onboarding form asks for it itself (as its own first question)
        // only if it actually needs to know, rather than us asking it in a
        // separate custom step first.
        business_profile: {
          name: church.name,
          ...(isPublicUrl ? { url: `${appUrl}/${church.slug}` } : {}),
        },
        // A church's connected account only ever receives payouts — the
        // platform is always the one charging givers — so `transfers` is the
        // only capability needed. No `card_payments` means no MCC/industry
        // question, no statement descriptor, no business address/phone
        // (verified against real Stripe test accounts).
        capabilities: { transfers: { requested: true } },
        // No `company` prefill here — Stripe rejects sending a `company`
        // object without also setting `business_type` (confirmed via a
        // real API call), and business_type is intentionally left unset.
      });
      accountId = account.id;
      await prisma.church.update({
        where: { id: church.id },
        data: { stripeAccountId: accountId },
      });
    }

    const accountSession = await stripe.accountSessions.create({
      account: accountId,
      components: {
        account_onboarding: { enabled: true },
      },
    });

    return NextResponse.json({ clientSecret: accountSession.client_secret });
  } catch (err) {
    console.error('Stripe Connect session failed', err);
    return NextResponse.json({ error: 'Failed to start bank account setup' }, { status: 500 });
  }
}
