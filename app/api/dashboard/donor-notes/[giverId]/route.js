import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { requireUser } from '@/lib/auth';
import { planHasFeature } from '@/lib/plans';

async function loadChurchAndGiver(user, giverId) {
  const church = await prisma.church.findFirst({ where: { ownerId: user.sub } });
  if (!church) return { error: NextResponse.json({ error: 'No church found for this account' }, { status: 404 }) };
  if (!planHasFeature(church, 'donor_notes')) {
    return {
      error: NextResponse.json(
        { error: 'Donor notes require the Ministry plan or higher.', code: 'PLAN_UPGRADE_REQUIRED' },
        { status: 403 }
      ),
    };
  }
  // Only lets a pastor tag/note someone who has actually given to their
  // church — not an arbitrary user id.
  const hasGiven = await prisma.donation.findFirst({ where: { churchId: church.id, giverId } });
  if (!hasGiven) return { error: NextResponse.json({ error: 'Giver not found' }, { status: 404 }) };
  return { church };
}

export async function GET(req, { params }) {
  const { user, error } = await requireUser('pastor');
  if (error) return error;
  const { giverId } = await params;

  const { church, error: gateError } = await loadChurchAndGiver(user, giverId);
  if (gateError) return gateError;

  const note = await prisma.donorNote.findUnique({
    where: { churchId_giverId: { churchId: church.id, giverId } },
  });

  return NextResponse.json({ note: note?.note || '', tags: note?.tags || [] });
}

const schema = z.object({
  note: z.string().max(2000).optional(),
  tags: z.array(z.string().max(40)).max(20).optional(),
});

export async function PUT(req, { params }) {
  const { user, error } = await requireUser('pastor');
  if (error) return error;
  const { giverId } = await params;

  const { church, error: gateError } = await loadChurchAndGiver(user, giverId);
  if (gateError) return gateError;

  let input;
  try {
    input = schema.parse(await req.json());
  } catch (err) {
    return NextResponse.json({ error: 'Invalid request', details: err.errors }, { status: 400 });
  }

  const note = await prisma.donorNote.upsert({
    where: { churchId_giverId: { churchId: church.id, giverId } },
    create: { churchId: church.id, giverId, note: input.note || null, tags: input.tags || [] },
    update: { note: input.note || null, tags: input.tags || [] },
  });

  return NextResponse.json({ note: note.note || '', tags: note.tags });
}
