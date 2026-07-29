import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { requireUser } from '@/lib/auth';
import { notifyNewPost } from '@/lib/notifications';

const schema = z.object({ body: z.string().trim().min(1).max(2000) });

// A pastor's own posts (for managing them in the dashboard).
export async function GET() {
  const { user, error } = await requireUser('pastor');
  if (error) return error;

  const church = await prisma.church.findFirst({ where: { ownerId: user.sub } });
  if (!church) {
    return NextResponse.json({ error: 'No church found for this account' }, { status: 404 });
  }

  const posts = await prisma.post.findMany({
    where: { churchId: church.id },
    orderBy: { createdAt: 'desc' },
    take: 50,
    include: { _count: { select: { likes: true, comments: true } } },
  });

  const likedIds = new Set(
    (
      await prisma.like.findMany({
        where: { userId: user.sub, postId: { in: posts.map((p) => p.id) } },
        select: { postId: true },
      })
    ).map((l) => l.postId)
  );

  return NextResponse.json({
    posts: posts.map((p) => ({
      id: p.id,
      body: p.body,
      createdAt: p.createdAt,
      likeCount: p._count.likes,
      commentCount: p._count.comments,
      isLiked: likedIds.has(p.id),
    })),
  });
}

export async function POST(req) {
  const { user, error } = await requireUser('pastor');
  if (error) return error;

  const church = await prisma.church.findFirst({ where: { ownerId: user.sub } });
  if (!church) {
    return NextResponse.json({ error: 'No church found for this account' }, { status: 404 });
  }

  let input;
  try {
    input = schema.parse(await req.json());
  } catch (err) {
    return NextResponse.json({ error: 'Invalid request', details: err.errors }, { status: 400 });
  }

  const post = await prisma.post.create({
    data: { churchId: church.id, body: input.body },
  });

  notifyNewPost(post, church).catch((err) => console.error('Failed to notify followers of new post', err));

  return NextResponse.json({ post });
}
