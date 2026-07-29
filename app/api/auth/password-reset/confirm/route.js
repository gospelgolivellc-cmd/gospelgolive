import { NextResponse } from 'next/server';
import { z } from 'zod';
import bcrypt from 'bcryptjs';
import { prisma } from '@/lib/prisma';
import { sendPasswordChangedEmail } from '@/lib/email';

const schema = z.object({
  token: z.string().min(1),
  newPassword: z.string().min(8),
});

export async function POST(req) {
  let input;
  try {
    input = schema.parse(await req.json());
  } catch (err) {
    return NextResponse.json({ error: 'Invalid request', details: err.errors }, { status: 400 });
  }

  const record = await prisma.verificationToken.findUnique({ where: { token: input.token } });

  if (
    !record ||
    record.purpose !== 'password_reset' ||
    record.usedAt ||
    record.expiresAt < new Date()
  ) {
    return NextResponse.json({ error: 'This reset link is invalid or has expired' }, { status: 400 });
  }

  const passwordHash = await bcrypt.hash(input.newPassword, 10);

  const [updatedUser] = await prisma.$transaction([
    prisma.user.update({ where: { id: record.userId }, data: { passwordHash } }),
    prisma.verificationToken.update({ where: { id: record.id }, data: { usedAt: new Date() } }),
  ]);

  const now = new Date();
  sendPasswordChangedEmail(updatedUser.email, {
    fullName: updatedUser.fullName,
    date: now.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }),
    time: now.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZoneName: 'short' }),
  }).catch((e) => console.error('Failed to send password-changed email', e));

  return NextResponse.json({ ok: true });
}
