import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireUser } from '@/lib/auth';

// Marks a single notification read — owner-only.
export async function PATCH(req, { params }) {
  const { user, error } = await requireUser();
  if (error) return error;

  const { id } = await params;
  const notification = await prisma.notification.findUnique({ where: { id } });
  if (!notification || notification.userId !== user.sub) {
    return NextResponse.json({ error: 'Notification not found' }, { status: 404 });
  }

  await prisma.notification.update({ where: { id }, data: { read: true } });
  return NextResponse.json({ success: true });
}
