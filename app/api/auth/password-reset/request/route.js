import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { generateToken } from '@/lib/tokens';
import { sendPasswordResetEmail } from '@/lib/email';
import { rateLimit } from '@/lib/rateLimit';

const schema = z.object({ email: z.string().email() });

const RESET_TOKEN_TTL_MS = 60 * 60 * 1000; // 1 hour

// Always returns 200 regardless of whether the email is registered — this
// stops the endpoint being used to check who has an account.
export async function POST(req) {
  const limited = rateLimit(req, 'password-reset-request', { max: 5, windowMs: 60_000 });
  if (limited) return limited;

  let input;
  try {
    input = schema.parse(await req.json());
  } catch (err) {
    return NextResponse.json({ error: 'Invalid request', details: err.errors }, { status: 400 });
  }

  const user = await prisma.user.findUnique({ where: { email: input.email } });

  if (user) {
    const token = generateToken();
    await prisma.verificationToken.create({
      data: {
        userId: user.id,
        token,
        purpose: 'password_reset',
        expiresAt: new Date(Date.now() + RESET_TOKEN_TTL_MS),
      },
    });

    try {
      await sendPasswordResetEmail(user.email, token, user.fullName);
    } catch (err) {
      console.error('Failed to send password reset email', err);
    }
  }

  return NextResponse.json({ ok: true });
}
