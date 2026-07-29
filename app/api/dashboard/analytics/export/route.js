import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireUser } from '@/lib/auth';
import { getPlan } from '@/lib/plans';
import { toCsv } from '@/lib/csv';

// Ministry+ only. General donation history export, includes anonymous gifts
// (unlike the donor-report, which is inherently about identifiable givers).
export async function GET() {
  const { user, error } = await requireUser('pastor');
  if (error) return error;

  const church = await prisma.church.findFirst({ where: { ownerId: user.sub } });
  if (!church) {
    return NextResponse.json({ error: 'No church found for this account' }, { status: 404 });
  }

  if (getPlan(church.plan).analyticsTier === 'basic') {
    return NextResponse.json({ error: 'CSV export requires the Ministry plan or higher.' }, { status: 403 });
  }

  const donations = await prisma.donation.findMany({
    where: { churchId: church.id },
    orderBy: { createdAt: 'desc' },
    include: { giver: { select: { fullName: true, email: true } } },
  });

  const rows = [
    ['Date', 'Giver Name', 'Giver Email', 'Amount', 'Platform Fee', 'Net Amount', 'Type', 'Note'],
    ...donations.map((d) => [
      d.createdAt.toISOString().slice(0, 10),
      d.giver?.fullName || 'Anonymous',
      d.giver?.email || '',
      (d.amountCents / 100).toFixed(2),
      (d.platformFeeCents / 100).toFixed(2),
      (d.netCents / 100).toFixed(2),
      d.isRecurring ? 'Recurring' : 'One-time',
      d.note || '',
    ]),
  ];

  const csv = toCsv(rows);
  const dateStamp = new Date().toISOString().slice(0, 10);

  return new NextResponse(csv, {
    headers: {
      'Content-Type': 'text/csv',
      'Content-Disposition': `attachment; filename="${church.slug}-donations-${dateStamp}.csv"`,
    },
  });
}
