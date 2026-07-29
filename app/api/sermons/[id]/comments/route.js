import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { requireUser, getCurrentUser } from '@/lib/auth';
import { listComments, createComment } from '@/lib/interactions';

const schema = z.object({ body: z.string().trim().min(1).max(2000) });

export async function GET(req, { params }) {
  const { id } = await params;
  const sermon = await prisma.sermon.findUnique({ where: { id }, select: { id: true } });
  if (!sermon) return NextResponse.json({ error: 'Sermon not found' }, { status: 404 });

  const viewer = await getCurrentUser();
  const comments = await listComments({ sermonId: id }, viewer?.sub);
  return NextResponse.json({ comments });
}

export async function POST(req, { params }) {
  const { user, error } = await requireUser();
  if (error) return error;

  const { id } = await params;
  const sermon = await prisma.sermon.findUnique({ where: { id }, select: { id: true } });
  if (!sermon) return NextResponse.json({ error: 'Sermon not found' }, { status: 404 });

  let input;
  try {
    input = schema.parse(await req.json());
  } catch (err) {
    return NextResponse.json({ error: 'Invalid request', details: err.errors }, { status: 400 });
  }

  const comment = await createComment(user.sub, { sermonId: id }, input.body);
  return NextResponse.json({ comment });
}
