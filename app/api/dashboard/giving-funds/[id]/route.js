import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireUser } from '@/lib/auth';
import { planHasFeature } from '@/lib/plans';

async function loadOwnedFund(user, id) {
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
  const fund = await prisma.givingFund.findUnique({ where: { id } });
  if (!fund || fund.churchId !== church.id) {
    return { error: NextResponse.json({ error: 'Fund not found' }, { status: 404 }) };
  }
  return { church, fund };
}

// Sets this fund as the church's default (the one pre-selected on the Give
// screen) — unsets any other fund currently marked default in the same
// transaction, since exactly one fund should be default at a time.
export async function PATCH(req, { params }) {
  const { user, error } = await requireUser('pastor');
  if (error) return error;
  const { id } = await params;

  const { church, fund, error: gateError } = await loadOwnedFund(user, id);
  if (gateError) return gateError;

  await prisma.$transaction([
    prisma.givingFund.updateMany({ where: { churchId: church.id, isDefault: true }, data: { isDefault: false } }),
    prisma.givingFund.update({ where: { id: fund.id }, data: { isDefault: true } }),
  ]);

  return NextResponse.json({ ok: true });
}

// Refuses to delete a fund that already has donations attached — the fund
// name still needs to display correctly on historical CSV exports and
// breakdowns, so it stays around instead of nulling out fundId on old rows.
export async function DELETE(req, { params }) {
  const { user, error } = await requireUser('pastor');
  if (error) return error;
  const { id } = await params;

  const { fund, error: gateError } = await loadOwnedFund(user, id);
  if (gateError) return gateError;

  const donationCount = await prisma.donation.count({ where: { fundId: fund.id } });
  if (donationCount > 0) {
    return NextResponse.json({ error: 'Cannot delete a fund that already has gifts recorded.' }, { status: 400 });
  }
  if (fund.isDefault) {
    return NextResponse.json({ error: 'Cannot delete the default fund. Set another fund as default first.' }, { status: 400 });
  }

  await prisma.givingFund.delete({ where: { id: fund.id } });
  return NextResponse.json({ ok: true });
}
