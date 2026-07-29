import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireUser } from '@/lib/auth';

// The Trust & Safety human review queue (protocol section E: "a human
// review queue is non-negotiable even at small scale"). Defaults to
// 'pending' so the queue view only shows reports someone actually still
// needs to act on; ?status=all pulls the full history for auditing.
export async function GET(req) {
  const { error } = await requireUser('admin');
  if (error) return error;

  const { searchParams } = new URL(req.url);
  const status = searchParams.get('status') || 'pending';

  const reports = await prisma.contentReport.findMany({
    where: status === 'all' ? {} : { status },
    orderBy: { createdAt: 'desc' },
    take: 100,
    include: {
      actions: { orderBy: { createdAt: 'asc' } },
      reporter: { select: { fullName: true, email: true } },
    },
  });

  return NextResponse.json({ reports });
}
