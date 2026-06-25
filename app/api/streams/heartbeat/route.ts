import { redis } from '@/lib/redis';
import { prismaClient } from '@/app/lib/db';
import { getServerSession } from 'next-auth';
import { NextRequest, NextResponse } from 'next/server';

const TTL = 3600; // 1 hour

export async function POST(req: NextRequest) {
  const session = await getServerSession();
  if (!session?.user?.email) return new NextResponse(null, { status: 401 });

  const creatorId = req.nextUrl.searchParams.get('creatorId');
  if (!creatorId) return new NextResponse(null, { status: 400 });

  // Verify identity — Redis-cached, falls back to DB on first call
  let userId = await redis.get(`uid:${session.user.email}`);
  if (!userId) {
    const user = await prismaClient.user.findFirst({ where: { email: session.user.email }, select: { id: true } });
    if (!user) return new NextResponse(null, { status: 403 });
    userId = user.id;
    await redis.set(`uid:${session.user.email}`, userId, { EX: 86400 });
  }
  if (userId !== creatorId) return new NextResponse(null, { status: 403 });

  const sessionKeys = [
    `queue:${creatorId}`,
    `now_playing:${creatorId}`,
    `round_ends_at:${creatorId}`,
    `queue_mode:${creatorId}`,
    `queue_vids:${creatorId}`,
    `session_songs:${creatorId}`,
  ];

  // Refresh TTL on session keys + all song hashes in parallel
  const [songIds] = await Promise.all([
    redis.sMembers(`session_songs:${creatorId}`),
    ...sessionKeys.map(k => redis.expire(k, TTL)),
  ]);

  if (songIds.length > 0) {
    await Promise.all(songIds.map(id => redis.expire(`song:${id}`, TTL)));
  }

  return new NextResponse(null, { status: 204 });
}
