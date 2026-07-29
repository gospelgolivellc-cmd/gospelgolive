import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireUser } from '@/lib/auth';
import { relayStop } from '@/lib/ingestRelay';

export const runtime = 'nodejs';

export async function POST() {
  const { user, error } = await requireUser('pastor');
  if (error) return error;

  const church = await prisma.church.findFirst({ where: { ownerId: user.sub }, select: { id: true } });
  if (!church) {
    return NextResponse.json({ error: 'No church found for this account' }, { status: 404 });
  }

  await relayStop(church.id);
  return NextResponse.json({ ok: true });
}
