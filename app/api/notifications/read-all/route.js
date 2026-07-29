import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireUser } from '@/lib/auth';

export async function POST() {
  const { user, error } = await requireUser();
  if (error) return error;

  await prisma.notification.updateMany({
    where: { userId: user.sub, read: false },
    data: { read: true },
  });

  return NextResponse.json({ success: true });
}
