import { redis } from '@/lib/redis';
import { getServerSession } from 'next-auth';
import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
  const session = await getServerSession();
  if (!session?.user?.email) return new NextResponse(null, { status: 401 });

  const { creatorId } = await req.json() as { creatorId: string };
  if (!creatorId) return new NextResponse(null, { status: 400 });

  // Verify via cached ID only (no DB on logout path)
  const userId = await redis.get(`uid:${session.user.email}`);
  if (!userId || userId !== creatorId) return new NextResponse(null, { status: 403 });

  const songIds = await redis.sMembers(`session_songs:${creatorId}`);

  const keys = [
    `queue:${creatorId}`,
    `now_playing:${creatorId}`,
    `round_ends_at:${creatorId}`,
    `queue_mode:${creatorId}`,
    `queue_vids:${creatorId}`,
    `session_songs:${creatorId}`,
    ...songIds.map(id => `song:${id}`),
  ];

  if (keys.length) await redis.del(keys);

  return new NextResponse(null, { status: 204 });
}
