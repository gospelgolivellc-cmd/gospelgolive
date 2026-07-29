import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { requireUser } from '@/lib/auth';

const schema = z.object({
  endpoint: z.string().url(),
  keys: z.object({
    p256dh: z.string().min(1),
    auth: z.string().min(1),
  }),
});

// Saves (or re-links, if another account previously subscribed on this same
// browser) the PushSubscription object handed back by the client's
// PushManager.subscribe(). endpoint is globally unique, so a re-subscribe on
// the same device just upserts in place rather than accumulating duplicates.
export async function POST(req) {
  const { user, error } = await requireUser();
  if (error) return error;

  let input;
  try {
    input = schema.parse(await req.json());
  } catch (err) {
    return NextResponse.json({ error: 'Invalid request', details: err.errors }, { status: 400 });
  }

  await prisma.pushSubscription.upsert({
    where: { endpoint: input.endpoint },
    create: { userId: user.sub, endpoint: input.endpoint, p256dh: input.keys.p256dh, auth: input.keys.auth },
    update: { userId: user.sub, p256dh: input.keys.p256dh, auth: input.keys.auth },
  });

  return NextResponse.json({ success: true });
}
