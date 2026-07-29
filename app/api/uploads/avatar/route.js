import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireUser } from '@/lib/auth';
import { saveUploadedImage } from '@/lib/uploads';

// Any signed-in user (pastor or seeker) can update their own profile photo.
export async function POST(req) {
  const { user, error } = await requireUser();
  if (error) return error;

  const form = await req.formData();
  const file = form.get('file');

  let url;
  try {
    url = await saveUploadedImage(file, 'avatar', user.sub);
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 400 });
  }

  await prisma.user.update({ where: { id: user.sub }, data: { avatarUrl: url } });

  return NextResponse.json({ avatarUrl: url });
}
