import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { requireUser } from '@/lib/auth';
import { parseLocationInput } from '@/lib/geo';

const schema = z.object({
  fullName: z.string().trim().min(1).max(200),
  location: z.string().trim().max(120).optional().or(z.literal('')),
});

// interests is deliberately not editable here (or anywhere post-signup) —
// it's captured once at onboarding and left alone from then on, since it now
// feeds /api/churches/recommended as the seeker's initial-preference signal
// rather than something they manage directly.
export async function PATCH(req) {
  const { user, error } = await requireUser('seeker');
  if (error) return error;

  let input;
  try {
    input = schema.parse(await req.json());
  } catch (err) {
    return NextResponse.json({ error: 'Invalid request', details: err.errors }, { status: 400 });
  }

  // Editing here always overwrites whatever signup captured (self-report or
  // IP fallback) — no re-inference once the seeker has told us directly.
  const { city, state } = parseLocationInput(input.location || '');

  await prisma.user.update({
    where: { id: user.sub },
    data: { fullName: input.fullName, city, state, country: state ? 'US' : null },
  });

  return NextResponse.json({ success: true });
}
