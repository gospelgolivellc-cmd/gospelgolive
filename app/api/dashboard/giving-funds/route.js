import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { requireUser } from '@/lib/auth';
import { planHasFeature } from '@/lib/plans';

async function loadGatedChurch(user) {
  const church = await prisma.church.findFirst({ where: { ownerId: user.sub } });
  if (!church) return { error: NextResponse.json({ error: 'No church found for this account' }, { status: 404 }) };
  if (!planHasFeature(church, 'giving_funds')) {
    return {
      error: NextResponse.json(
        { error: 'Multiple giving funds require the Congregation plan.', code: 'PLAN_UPGRADE_REQUIRED' },
        { status: 403 }
      ),
    };
  }
  return { church };
}

export async function GET() {
  const { user, error } = await requireUser('pastor');
  if (error) return error;

  const { church, error: gateError } = await loadGatedChurch(user);
  if (gateError) return gateError;

  const [funds, sums] = await Promise.all([
    prisma.givingFund.findMany({
      where: { churchId: church.id },
      orderBy: { createdAt: 'asc' },
      include: { _count: { select: { donations: true } } },
    }),
    prisma.donation.groupBy({ by: ['fundId'], where: { churchId: church.id, fundId: { not: null } }, _sum: { netCents: true } }),
  ]);
  const sumByFundId = new Map(sums.map((s) => [s.fundId, s._sum.netCents ?? 0]));

  return NextResponse.json({
    funds: funds.map((f) => ({
      id: f.id,
      name: f.name,
      isDefault: f.isDefault,
      donationCount: f._count.donations,
      netCents: sumByFundId.get(f.id) ?? 0,
    })),
  });
}

const schema = z.object({ name: z.string().min(1).max(60) });

export async function POST(req) {
  const { user, error } = await requireUser('pastor');
  if (error) return error;

  const { church, error: gateError } = await loadGatedChurch(user);
  if (gateError) return gateError;

  let input;
  try {
    input = schema.parse(await req.json());
  } catch (err) {
    return NextResponse.json({ error: 'Invalid request', details: err.errors }, { status: 400 });
  }

  const existingCount = await prisma.givingFund.count({ where: { churchId: church.id } });

  const fund = await prisma.givingFund.create({
    data: { churchId: church.id, name: input.name, isDefault: existingCount === 0 },
  });

  return NextResponse.json({ id: fund.id, name: fund.name, isDefault: fund.isDefault, donationCount: 0 });
}
