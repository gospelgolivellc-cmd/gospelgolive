import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { requireUser } from '@/lib/auth';

const schema = z.object({ endpoint: z.string().url() });

export async function POST(req) {
  const { user, error } = await requireUser();
  if (error) return error;

  let input;
  try {
    input = schema.parse(await req.json());
  } catch (err) {
    return NextResponse.json({ error: 'Invalid request', details: err.errors }, { status: 400 });
  }

  // Scoped to the current user too, not just the endpoint, so one signed-in
  // account can't unsubscribe a device it doesn't actually own.
  await prisma.pushSubscription.deleteMany({ where: { endpoint: input.endpoint, userId: user.sub } });

  return NextResponse.json({ success: true });
}
