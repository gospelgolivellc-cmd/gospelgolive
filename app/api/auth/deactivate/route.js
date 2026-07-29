import { NextResponse } from 'next/server';
import { z } from 'zod';
import bcrypt from 'bcryptjs';
import { prisma } from '@/lib/prisma';
import { requireUser, clearSessionCookie } from '@/lib/auth';
import { sendAccountDeactivatedEmail } from '@/lib/email';

const schema = z.object({ password: z.string().min(1) });

// Requires the current password as a confirmation step, same as changing it —
// this is a destructive, hard-to-reverse action (no reactivation flow exists).
export async function POST(req) {
  const { user, error } = await requireUser();
  if (error) return error;

  let input;
  try {
    input = schema.parse(await req.json());
  } catch (err) {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
  }

  const dbUser = await prisma.user.findUnique({ where: { id: user.sub } });
  const valid = await bcrypt.compare(input.password, dbUser.passwordHash);
  if (!valid) {
    return NextResponse.json({ error: 'Password is incorrect' }, { status: 400 });
  }

  await prisma.user.update({ where: { id: user.sub }, data: { deactivatedAt: new Date() } });

  sendAccountDeactivatedEmail(dbUser.email, { fullName: dbUser.fullName }).catch((e) =>
    console.error('Failed to send account-deactivated email', e)
  );

  const response = NextResponse.json({ success: true });
  return clearSessionCookie(response);
}
