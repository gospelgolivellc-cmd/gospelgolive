import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { requireUser } from '@/lib/auth';
import { recordDmcaTakedown } from '@/lib/dmca';

const schema = z.object({
  contentType: z.enum(['sermon', 'stream']),
  contentId: z.string().uuid(),
  claimant: z.object({
    name: z.string().min(1),
    email: z.string().email(),
    address: z.string().optional(),
    phone: z.string().optional(),
  }),
  copyrightedWorkDescription: z.string().min(1),
  goodFaithStatement: z.literal(true),
  perjuryStatement: z.literal(true),
  signature: z.string().min(1),
});

// Logs a DMCA takedown notice against a specific sermon/stream and removes
// it immediately (DMCA Copyright Policy section 2) — there's no discretionary
// hold step the way general nudity moderation has; an admin manually enters
// a notice here only once they've confirmed it contains all six statutory
// elements from an actual received notice (email, mail, etc.), so recording
// it here *is* the validity determination.
export async function POST(req) {
  const { user, error } = await requireUser('admin');
  if (error) return error;

  let input;
  try {
    input = schema.parse(await req.json());
  } catch (err) {
    return NextResponse.json({ error: 'Invalid request — a DMCA notice requires all six statutory elements (see policy section 1)', details: err.errors }, { status: 400 });
  }

  try {
    const result = await recordDmcaTakedown({ ...input, adminUserId: user.sub });
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 400 });
  }
}

// Lists DMCA notices for the admin queue — separate from GET
// /api/admin/reports since a notice carries claimant/counter-notice detail
// that generic content reports don't have.
export async function GET(req) {
  const { error } = await requireUser('admin');
  if (error) return error;

  const { searchParams } = new URL(req.url);
  const status = searchParams.get('status');

  const notices = await prisma.dmcaNotice.findMany({
    where: status ? { status } : {},
    orderBy: { createdAt: 'desc' },
    take: 100,
    include: { report: { include: { actions: { orderBy: { createdAt: 'asc' } } } } },
  });

  return NextResponse.json({ notices });
}
