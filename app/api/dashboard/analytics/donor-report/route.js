import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireUser } from '@/lib/auth';
import { getPlan } from '@/lib/plans';
import { toCsv } from '@/lib/csv';

// Ministry+ only. Per-donor giving summary for tax/statement purposes, a
// genuine giving statement is inherently calendar-year scoped, so this
// accepts ?year= (defaulting to the current year) rather than shipping
// all-time-only. Anonymous gifts are excluded entirely (a donor report is
// about identifiable givers), unlike the general export above.
export async function GET(req) {
  const { user, error } = await requireUser('pastor');
  if (error) return error;

  const church = await prisma.church.findFirst({ where: { ownerId: user.sub } });
  if (!church) {
    return NextResponse.json({ error: 'No church found for this account' }, { status: 404 });
  }

  if (getPlan(church.plan).analyticsTier === 'basic') {
    return NextResponse.json({ error: 'Donor giving reports require the Ministry plan or higher.' }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const yearParam = parseInt(searchParams.get('year'), 10);
  const year = Number.isInteger(yearParam) ? yearParam : new Date().getFullYear();
  const yearStart = new Date(Date.UTC(year, 0, 1));
  const yearEnd = new Date(Date.UTC(year + 1, 0, 1));

  const [grouped, donations] = await Promise.all([
    prisma.donation.groupBy({
      by: ['giverId'],
      where: { churchId: church.id, giverId: { not: null }, createdAt: { gte: yearStart, lt: yearEnd } },
      _sum: { amountCents: true },
      _count: true,
    }),
    // groupBy can't return min/max(createdAt) alongside a relation join, so
    // pull the raw rows once and derive first/last gift dates per donor here.
    prisma.donation.findMany({
      where: { churchId: church.id, giverId: { not: null }, createdAt: { gte: yearStart, lt: yearEnd } },
      select: { giverId: true, createdAt: true },
    }),
  ]);

  const giverIds = grouped.map((g) => g.giverId);
  const givers = giverIds.length
    ? await prisma.user.findMany({ where: { id: { in: giverIds } }, select: { id: true, fullName: true, email: true } })
    : [];
  const giverById = new Map(givers.map((g) => [g.id, g]));

  const datesByGiver = new Map();
  donations.forEach((d) => {
    const existing = datesByGiver.get(d.giverId);
    if (!existing) {
      datesByGiver.set(d.giverId, { first: d.createdAt, last: d.createdAt });
    } else {
      if (d.createdAt < existing.first) existing.first = d.createdAt;
      if (d.createdAt > existing.last) existing.last = d.createdAt;
    }
  });

  const rows = [
    ['Donor Name', 'Donor Email', 'Total Given', 'Number of Gifts', 'First Gift Date', 'Last Gift Date'],
    ...grouped
      .sort((a, b) => (b._sum.amountCents ?? 0) - (a._sum.amountCents ?? 0))
      .map((g) => {
        const giver = giverById.get(g.giverId);
        const dates = datesByGiver.get(g.giverId);
        return [
          giver?.fullName || 'Unknown',
          giver?.email || '',
          ((g._sum.amountCents ?? 0) / 100).toFixed(2),
          g._count,
          dates ? dates.first.toISOString().slice(0, 10) : '',
          dates ? dates.last.toISOString().slice(0, 10) : '',
        ];
      }),
  ];

  const csv = toCsv(rows);

  return new NextResponse(csv, {
    headers: {
      'Content-Type': 'text/csv',
      'Content-Disposition': `attachment; filename="${church.slug}-donor-report-${year}.csv"`,
    },
  });
}
