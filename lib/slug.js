import { prisma } from '@/lib/prisma';

export function slugify(name) {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

export async function uniqueChurchSlug(base) {
  let slug = base || 'church';
  let suffix = 1;
  while (await prisma.church.findUnique({ where: { slug } })) {
    suffix += 1;
    slug = `${base || 'church'}-${suffix}`;
  }
  return slug;
}
