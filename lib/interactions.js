import { prisma } from '@/lib/prisma';

// `target` is always exactly one of { sermonId }, { streamId }, or { postId }
// — callers are responsible for that shape, matching the DB's CHECK constraint.

function uniqueLikeWhere(userId, target) {
  if (target.sermonId) return { userId_sermonId: { userId, sermonId: target.sermonId } };
  if (target.streamId) return { userId_streamId: { userId, streamId: target.streamId } };
  if (target.commentId) return { userId_commentId: { userId, commentId: target.commentId } };
  return { userId_postId: { userId, postId: target.postId } };
}

export async function getLikeState(userId, target) {
  const [count, mine] = await Promise.all([
    prisma.like.count({ where: target }),
    userId ? prisma.like.findUnique({ where: uniqueLikeWhere(userId, target) }) : null,
  ]);
  return { count, isLiked: Boolean(mine) };
}

export async function toggleLike(userId, target) {
  const existing = await prisma.like.findUnique({ where: uniqueLikeWhere(userId, target) });

  if (existing) {
    await prisma.like.delete({ where: { id: existing.id } });
    return { isLiked: false, count: await prisma.like.count({ where: target }) };
  }

  await prisma.like.create({ data: { userId, ...target } });
  return { isLiked: true, count: await prisma.like.count({ where: target }) };
}

function shapeComment(comment, extra = {}) {
  return {
    id: comment.id,
    body: comment.body,
    authorId: comment.userId,
    authorName: comment.user.fullName,
    authorRole: comment.user.role,
    createdAt: comment.createdAt,
    likeCount: comment._count?.likes ?? extra.likeCount ?? 0,
    isLiked: extra.isLiked ?? false,
  };
}

// viewerId is optional — anonymous viewers still see comments and like
// counts, just with isLiked always false.
export async function listComments(target, viewerId) {
  const comments = await prisma.comment.findMany({
    where: target,
    orderBy: { createdAt: 'desc' },
    take: 100,
    include: { user: { select: { fullName: true, role: true } }, _count: { select: { likes: true } } },
  });

  let likedIds = new Set();
  if (viewerId && comments.length) {
    const likes = await prisma.like.findMany({
      where: { userId: viewerId, commentId: { in: comments.map((c) => c.id) } },
      select: { commentId: true },
    });
    likedIds = new Set(likes.map((l) => l.commentId));
  }

  return comments.map((c) => shapeComment(c, { isLiked: likedIds.has(c.id) }));
}

export async function createComment(userId, target, body) {
  const comment = await prisma.comment.create({
    data: { userId, ...target, body },
    include: { user: { select: { fullName: true, role: true } } },
  });
  return shapeComment(comment);
}
