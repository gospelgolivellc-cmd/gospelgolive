import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { requireUser } from '@/lib/auth';
import { parseLocationInput } from '@/lib/geo';
import { INTERESTS } from '@/lib/interests';

const schema = z.object({
  churchName: z.string().trim().min(1).max(200),
  pastorName: z.string().trim().min(1).max(200),
  address: z.string().trim().max(300).optional().or(z.literal('')),
  location: z.string().trim().max(120).optional().or(z.literal('')),
  interests: z.array(z.enum(INTERESTS)).max(INTERESTS.length).optional().default([]),
});

export async function PATCH(req) {
  const { user, error } = await requireUser('pastor');
  if (error) return error;

  const church = await prisma.church.findFirst({ where: { ownerId: user.sub } });
  if (!church) {
    return NextResponse.json({ error: 'No church found for this account' }, { status: 404 });
  }

  let input;
  try {
    input = schema.parse(await req.json());
  } catch (err) {
    return NextResponse.json({ error: 'Invalid request', details: err.errors }, { status: 400 });
  }

  // Editing here always overwrites whatever signup captured (self-report or
  // IP fallback) — no re-inference once the pastor has told us directly.
  const { city, state } = parseLocationInput(input.location || '');

  await prisma.$transaction([
    prisma.church.update({
      where: { id: church.id },
      data: {
        name: input.churchName,
        address: input.address || null,
        city,
        state,
        country: state ? 'US' : null,
        interests: input.interests,
      },
    }),
    prisma.user.update({ where: { id: user.sub }, data: { fullName: input.pastorName } }),
  ]);

  return NextResponse.json({ success: true });
}
