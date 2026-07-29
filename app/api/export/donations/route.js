import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireUser } from '@/lib/auth';
import { planHasFeature } from '@/lib/plans';
import { toCsv } from '@/lib/csv';

// Ministry+ QuickBooks/accounting export, a simple bank-transaction-style
// CSV (Date, Description, Amount) rather than the richer Ministry+ donor
// report at /api/dashboard/analytics/export, which includes fees and giver
// contact info. Accepts optional ?from=&to= (YYYY-MM-DD) date range.
export async function GET(req) {
  const { user, error } = await requireUser('pastor');
  if (error) return error;

  const church = await prisma.church.findFirst({ where: { ownerId: user.sub } });
  if (!church) {
    return NextResponse.json({ error: 'No church found for this account' }, { status: 404 });
  }
  if (!planHasFeature(church, 'accounting_export')) {
    return NextResponse.json(
      { error: 'Accounting export requires the Ministry plan or higher.', code: 'PLAN_UPGRADE_REQUIRED' },
      { status: 403 }
    );
  }

  const { searchParams } = new URL(req.url);
  const from = searchParams.get('from');
  const to = searchParams.get('to');
  const createdAt = {};
  if (from) createdAt.gte = new Date(`${from}T00:00:00.000Z`);
  if (to) createdAt.lte = new Date(`${to}T23:59:59.999Z`);

  const donations = await prisma.donation.findMany({
    where: { churchId: church.id, ...(from || to ? { createdAt } : {}) },
    orderBy: { createdAt: 'desc' },
    include: { giver: { select: { fullName: true } }, fund: { select: { name: true } } },
  });

  const rows = [
    ['Date', 'Description', 'Amount'],
    ...donations.map((d) => {
      const giverLabel = d.giver?.fullName || 'Anonymous';
      const fundLabel = d.fund?.name ? ` — ${d.fund.name}` : '';
      const typeLabel = d.isRecurring ? 'Recurring gift' : 'Gift';
      return [
        d.createdAt.toISOString().slice(0, 10),
        `${typeLabel} from ${giverLabel}${fundLabel}`,
        (d.netCents / 100).toFixed(2),
      ];
    }),
  ];

  const csv = toCsv(rows);
  const dateStamp = new Date().toISOString().slice(0, 10);

  return new NextResponse(csv, {
    headers: {
      'Content-Type': 'text/csv',
      'Content-Disposition': `attachment; filename="${church.slug}-accounting-export-${dateStamp}.csv"`,
    },
  });
}
