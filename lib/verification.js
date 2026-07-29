import { prisma } from '@/lib/prisma';
import { generateToken } from '@/lib/tokens';
import { sendVerificationEmail } from '@/lib/email';

const VERIFY_TOKEN_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

export async function issueVerificationEmail(user) {
  const token = generateToken();
  await prisma.verificationToken.create({
    data: {
      userId: user.id,
      token,
      purpose: 'email_verify',
      expiresAt: new Date(Date.now() + VERIFY_TOKEN_TTL_MS),
    },
  });
  await sendVerificationEmail(user.email, token, user.fullName);
}
