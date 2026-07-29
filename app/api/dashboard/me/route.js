import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireUser } from '@/lib/auth';
import { syncProcessingSermons } from '@/lib/mux';
import { getPlan } from '@/lib/plans';
import { startOfMonth, resumeStaleCapPauses } from '@/lib/givingCap';

async function buildPastorPayload(userId) {
  const church = await prisma.church.findFirst({ where: { ownerId: userId } });
  if (!church) {
    return { user: null, church: null, stats: null };
  }

  await syncProcessingSermons(church.id);
  await resumeStaleCapPauses(church.id);

  const [
    subscriberCount,
    sermonCount,
    recentSermons,
    allSermons,
    givingAgg,
    monthlyGivingAgg,
    recentDonations,
    viewAgg,
    activeGivers,
  ] = await Promise.all([
    prisma.follow.count({ where: { churchId: church.id } }),
    prisma.sermon.count({ where: { churchId: church.id } }),
    prisma.sermon.findMany({
      where: { churchId: church.id },
      orderBy: { createdAt: 'desc' },
      take: 5,
      select: { id: true, title: true, status: true, createdAt: true },
    }),
    prisma.sermon.findMany({
      where: { churchId: church.id },
      orderBy: { createdAt: 'desc' },
      take: 50,
      select: {
        id: true,
        title: true,
        status: true,
        createdAt: true,
        playbackId: true,
        durationSeconds: true,
        hidden: true,
        shareCount: true,
        _count: { select: { likes: true, comments: true } },
      },
    }),
    prisma.donation.aggregate({
      where: { churchId: church.id },
      _sum: { netCents: true },
    }),
    prisma.donation.aggregate({
      where: { churchId: church.id, createdAt: { gte: startOfMonth() } },
      _sum: { amountCents: true, netCents: true },
      _count: true,
    }),
    prisma.donation.findMany({
      where: { churchId: church.id },
      orderBy: { createdAt: 'desc' },
      take: 10,
      include: { giver: { select: { fullName: true } } },
    }),
    prisma.viewEvent.aggregate({
      where: { OR: [{ sermon: { churchId: church.id } }, { stream: { churchId: church.id } }] },
      _count: true,
      _sum: { watchSeconds: true },
    }),
    prisma.donation.groupBy({
      by: ['giverId'],
      where: { churchId: church.id, giverId: { not: null } },
    }),
  ]);

  const plan = getPlan(church.plan);

  return {
    church: {
      name: church.name,
      slug: church.slug,
      plan: church.plan,
      planLabel: plan.label,
      billingInterval: church.billingInterval,
      priceCents: plan.priceCents || null,
      platformFeeRate: plan.platformFeeRate,
      monthlyGivingCapCents: plan.monthlyGivingCapCents,
      storageHoursCap: plan.storageHoursCap,
      maxConcurrentViewers: plan.maxConcurrentViewers,
      analyticsTier: plan.analyticsTier,
      features: plan.features,
      subscriptionStatus: church.subscriptionStatus,
      trialEndsAt: church.trialEndsAt,
      bannerUrl: church.bannerUrl,
      overlayImageUrl: church.overlayImageUrl,
      textToGivePhoneNumber: church.textToGivePhoneNumber,
      address: church.address,
      city: church.city,
      state: church.state,
      interests: church.interests,
      stripeOnboarded: church.stripeOnboarded,
      hasStripeAccount: Boolean(church.stripeAccountId),
    },
    stats: {
      subscriberCount,
      sermonCount,
      recentSermons,
      allSermons: allSermons.map((s) => ({
        id: s.id,
        title: s.title,
        status: s.status,
        createdAt: s.createdAt,
        playbackId: s.playbackId,
        durationSeconds: s.durationSeconds,
        hidden: s.hidden,
        shareCount: s.shareCount,
        likeCount: s._count.likes,
        commentCount: s._count.comments,
      })),
      totalGivingNetCents: givingAgg._sum.netCents ?? 0,
      // Gross — what the congregation actually gave, before the platform
      // fee is deducted. Distinct from the *Net ("collected") figures below,
      // which are what the church actually receives after fees.
      givingThisMonthGrossCents: monthlyGivingAgg._sum.amountCents ?? 0,
      givingThisMonthNetCents: monthlyGivingAgg._sum.netCents ?? 0,
      givingThisMonthCount: monthlyGivingAgg._count ?? 0,
      activeGiverCount: activeGivers.length,
      recentDonations: recentDonations.map((d) => ({
        id: d.id,
        amountCents: d.amountCents,
        platformFeeCents: d.platformFeeCents,
        netCents: d.netCents,
        giverId: d.giverId,
        giverName: d.giver?.fullName ?? 'Anonymous',
        createdAt: d.createdAt,
      })),
      totalViews: viewAgg._count ?? 0,
      watchHours: Math.round(((viewAgg._sum.watchSeconds ?? 0) / 3600) * 10) / 10,
    },
  };
}

async function buildSeekerPayload(userId) {
  const [follows, donations, recurringGifts] = await Promise.all([
    prisma.follow.findMany({
      where: { seekerId: userId },
      include: { church: { select: { name: true, slug: true } } },
      orderBy: { createdAt: 'desc' },
    }),
    prisma.donation.findMany({
      where: { giverId: userId },
      include: { church: { select: { name: true } } },
      orderBy: { createdAt: 'desc' },
      take: 10,
    }),
    // Only active/paused — canceled ones aren't shown here, the giving
    // history above already covers past charges. This is purely for
    // managing what's still running.
    prisma.givingSubscription.findMany({
      where: { giverId: userId, status: { in: ['active', 'paused'] } },
      include: { church: { select: { name: true } } },
      orderBy: { createdAt: 'desc' },
    }),
  ]);

  return {
    stats: {
      favoriteChurches: follows.map((f) => ({ name: f.church.name, slug: f.church.slug })),
      givingHistory: donations.map((d) => ({
        id: d.id,
        churchName: d.church.name,
        amountCents: d.amountCents,
        createdAt: d.createdAt,
      })),
      recurringGifts: recurringGifts.map((g) => ({
        id: g.id,
        churchName: g.church.name,
        amountCents: g.amountCents,
        status: g.status,
      })),
    },
  };
}

export async function GET() {
  const { user, error } = await requireUser();
  if (error) return error;

  const dbUser = await prisma.user.findUnique({
    where: { id: user.sub },
    select: {
      id: true,
      email: true,
      fullName: true,
      role: true,
      emailVerified: true,
      avatarUrl: true,
      city: true,
      state: true,
      interests: true,
      onboardingCompletedAt: true,
    },
  });
  if (!dbUser) {
    return NextResponse.json({ error: 'User not found' }, { status: 404 });
  }

  const payload =
    dbUser.role === 'pastor' ? await buildPastorPayload(dbUser.id) : await buildSeekerPayload(dbUser.id);

  return NextResponse.json({ user: dbUser, ...payload });
}
