import { redis } from '@/lib/redis';
import { getQueue, publishUpdate } from '@/lib/queue';
import { getServerSession } from 'next-auth';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

const Schema = z.object({ streamId: z.string(), creatorId: z.string() });

function getIp(req: NextRequest): string {
  return req.headers.get('x-forwarded-for')?.split(',')[0].trim() ?? req.headers.get('x-real-ip') ?? 'anon';
}

export async function POST(req: NextRequest) {
  const session = await getServerSession();
  const identifier = session?.user?.email ? `user:${session.user.email}` : `ip:${getIp(req)}`;

  let body: z.infer<typeof Schema>;
  try { body = Schema.parse(await req.json()); }
  catch { return NextResponse.json({ message: 'Invalid request' }, { status: 400 }); }

  const { streamId, creatorId } = body;

  const inQueue = await redis.zScore(`queue:${creatorId}`, streamId);
  if (inQueue === null) return NextResponse.json({ message: 'Song not in queue' }, { status: 404 });

  const activeVoteKey = `active_vote:${identifier}:${creatorId}`;
  const currentVote = await redis.get(activeVoteKey);

  // Downvote only allowed on the song the user voted for
  if (currentVote !== streamId) {
    return NextResponse.json({
      message: 'You have not voted for this song.',
      activeVoteStreamId: currentVote ?? null,
    }, { status: 400 });
  }

  // Remove vote — clamp score to 0
  const newScore = Math.max(0, inQueue - 1);
  await Promise.all([
    redis.zAdd(`queue:${creatorId}`, { score: newScore, value: streamId }),
    redis.del(activeVoteKey),
  ]);
  const queue = await getQueue(creatorId);
  await publishUpdate(creatorId, { type: 'QUEUE_UPDATE', queue });
  return NextResponse.json({ message: 'Vote removed', activeVoteStreamId: null });
}
