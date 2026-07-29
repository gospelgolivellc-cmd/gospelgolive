import { NextResponse } from 'next/server';
import { z } from 'zod';
import bcrypt from 'bcryptjs';
import { prisma } from '@/lib/prisma';
import { requireUser } from '@/lib/auth';
import { sendPasswordChangedEmail } from '@/lib/email';

const schema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(8, 'New password must be at least 8 characters'),
});

export async function POST(req) {
  const { user, error } = await requireUser();
  if (error) return error;

  let input;
  try {
    input = schema.parse(await req.json());
  } catch (err) {
    return NextResponse.json({ error: err.errors?.[0]?.message || 'Invalid request' }, { status: 400 });
  }

  const dbUser = await prisma.user.findUnique({ where: { id: user.sub } });
  const valid = await bcrypt.compare(input.currentPassword, dbUser.passwordHash);
  if (!valid) {
    return NextResponse.json({ error: 'Current password is incorrect' }, { status: 400 });
  }

  const passwordHash = await bcrypt.hash(input.newPassword, 10);
  await prisma.user.update({ where: { id: user.sub }, data: { passwordHash } });

  const now = new Date();
  sendPasswordChangedEmail(dbUser.email, {
    fullName: dbUser.fullName,
    date: now.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }),
    time: now.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZoneName: 'short' }),
  }).catch((e) => console.error('Failed to send password-changed email', e));

  return NextResponse.json({ success: true });
}
