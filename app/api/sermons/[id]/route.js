import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { mux } from '@/lib/mux';
import { requireUser } from '@/lib/auth';

async function loadOwnedSermon(sermonId, userId) {
  const sermon = await prisma.sermon.findUnique({
    where: { id: sermonId },
    include: { church: { select: { ownerId: true } } },
  });
  if (!sermon || sermon.church.ownerId !== userId) return null;
  return sermon;
}

const patchSchema = z.object({ hidden: z.boolean() });

// Toggle whether a sermon appears on the church's public profile, without
// deleting it.
export async function PATCH(req, { params }) {
  const { user, error } = await requireUser('pastor');
  if (error) return error;

  const { id } = await params;
  const sermon = await loadOwnedSermon(id, user.sub);
  if (!sermon) {
    return NextResponse.json({ error: 'Sermon not found' }, { status: 404 });
  }

  let input;
  try {
    input = patchSchema.parse(await req.json());
  } catch (err) {
    return NextResponse.json({ error: 'Invalid request', details: err.errors }, { status: 400 });
  }

  const updated = await prisma.sermon.update({
    where: { id },
    data: { hidden: input.hidden },
  });

  return NextResponse.json({ sermon: { id: updated.id, hidden: updated.hidden } });
}

export async function DELETE(req, { params }) {
  const { user, error } = await requireUser('pastor');
  if (error) return error;

  const { id } = await params;
  const sermon = await loadOwnedSermon(id, user.sub);
  if (!sermon) {
    return NextResponse.json({ error: 'Sermon not found' }, { status: 404 });
  }

  if (sermon.videoProviderAssetId) {
    try {
      await mux.video.assets.delete(sermon.videoProviderAssetId);
    } catch (err) {
      // Don't block deletion of the sermon row on a Mux-side cleanup failure
      // (e.g. the asset was already removed there).
      console.error('Mux asset deletion failed', err.message);
    }
  }

  await prisma.sermon.delete({ where: { id } });

  return NextResponse.json({ deleted: true });
}
