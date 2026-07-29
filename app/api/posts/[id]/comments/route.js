import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { requireUser } from '@/lib/auth';
import { listComments, createComment } from '@/lib/interactions';

const schema = z.object({ body: z.string().trim().min(1).max(2000) });

// Posts are only visible to the owning pastor or seekers who follow that
// church — commenting shouldn't leak past that same boundary.
async function canAccessPost(userId, post) {
  if (post.church.ownerId === userId) return true;
  const follow = await prisma.follow.findUnique({
    where: { seekerId_churchId: { seekerId: userId, churchId: post.churchId } },
  });
  return Boolean(follow);
}

export async function GET(req, { params }) {
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

  const comments = await listComments({ postId: id }, user.sub);
  return NextResponse.json({ comments });
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

  let input;
  try {
    input = schema.parse(await req.json());
  } catch (err) {
    return NextResponse.json({ error: 'Invalid request', details: err.errors }, { status: 400 });
  }

  const comment = await createComment(user.sub, { postId: id }, input.body);
  return NextResponse.json({ comment });
}
