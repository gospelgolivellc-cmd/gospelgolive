import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getCurrentUser, requireUser } from '@/lib/auth';
import { getLikeState, toggleLike } from '@/lib/interactions';
import { notifyChurchLike } from '@/lib/notifications';

// Posts are only visible to the owning pastor or seekers who follow that
// church — liking/commenting shouldn't leak past that same boundary.
async function canAccessPost(userId, post) {
  if (post.church.ownerId === userId) return true;
  const follow = await prisma.follow.findUnique({
    where: { seekerId_churchId: { seekerId: userId, churchId: post.churchId } },
  });
  return Boolean(follow);
}

export async function GET(req, { params }) {
  const { id } = await params;
  const post = await prisma.post.findUnique({
    where: { id },
    select: { id: true, churchId: true, church: { select: { ownerId: true } } },
  });
  if (!post) return NextResponse.json({ error: 'Post not found' }, { status: 404 });

  const user = await getCurrentUser();
  if (!user || !(await canAccessPost(user.sub, post))) {
    return NextResponse.json({ error: 'Post not found' }, { status: 404 });
  }

  const state = await getLikeState(user.sub, { postId: id });
  return NextResponse.json(state);
}

export async function POST(req, { params }) {
  const { user, error } = await requireUser();
  if (error) return error;

  const { id } = await params;
  const post = await prisma.post.findUnique({
    where: { id },
    select: { id: true, churchId: true, church: { select: { ownerId: true } } },
  });
  if (!post || !(await canAccessPost(user.sub, post))) {
    return NextResponse.json({ error: 'Post not found' }, { status: 404 });
  }

  const state = await toggleLike(user.sub, { postId: id });
  if (state.isLiked) {
    notifyChurchLike(post.churchId, user.sub, 'post', 'p-posts').catch((e) =>
      console.error('Failed to notify church of post like', e)
    );
  }
  return NextResponse.json(state);
}
