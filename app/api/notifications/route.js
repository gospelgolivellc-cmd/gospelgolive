import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireUser } from '@/lib/auth';

export async function GET() {
  const { user, error } = await requireUser();
  if (error) return error;

  const [notifications, unreadCount] = await Promise.all([
    prisma.notification.findMany({
      where: { userId: user.sub },
      orderBy: { createdAt: 'desc' },
      take: 50,
      include: { church: { select: { name: true, slug: true } } },
    }),
    prisma.notification.count({ where: { userId: user.sub, read: false } }),
  ]);

  return NextResponse.json({
    unreadCount,
    notifications: notifications.map((n) => ({
      id: n.id,
      type: n.type,
      title: n.title,
      body: n.body,
      linkUrl: n.linkUrl,
      read: n.read,
      createdAt: n.createdAt,
      churchName: n.church.name,
      churchSlug: n.church.slug,
    })),
  });
}
