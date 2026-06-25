import { redis } from '@/lib/redis';
import { getQueue, publishUpdate } from '@/lib/queue';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

const ROUND_MS = 5 * 60 * 1000;
const TTL      = 3600;

const Schema = z.object({ creatorId: z.string(), force: z.boolean().optional() });

export async function POST(req: NextRequest) {
  let body: z.infer<typeof Schema>;
  try { body = Schema.parse(await req.json()); }
  catch { return NextResponse.json({ message: 'Invalid request' }, { status: 400 }); }

  const { creatorId, force } = body;

  if (!force) {
    const endsAt = await redis.get(`round_ends_at:${creatorId}`);
    if (endsAt && Date.now() < parseInt(endsAt))
      return NextResponse.json({ message: 'Not time yet' }, { status: 400 });
  }

  // Distributed lock to prevent concurrent advances
  const lock = `lock:next:${creatorId}`;
  const got  = await redis.setNX(lock, '1');
  if (!got) return NextResponse.json({ message: 'Already advancing' }, { status: 429 });
  await redis.expire(lock, 5);

  try {
    const topSongs = await redis.zRangeWithScores(`queue:${creatorId}`, 0, 0, { REV: true });

    if (!topSongs.length) {
      // Queue empty — loop current song instead of stopping
      const nowRaw = await redis.get(`now_playing:${creatorId}`);
      if (nowRaw) {
        const endsAt = Date.now() + ROUND_MS;
        await Promise.all([
          redis.set(`round_ends_at:${creatorId}`, endsAt.toString(), { EX: TTL }),
          redis.expire(`now_playing:${creatorId}`, TTL),
        ]);
        const queue      = await getQueue(creatorId);
        const nowPlaying = JSON.parse(nowRaw);
        await publishUpdate(creatorId, { type: 'NOW_PLAYING', song: nowPlaying, remainingMs: ROUND_MS, queue });
        return NextResponse.json({ nowPlaying, endsAt });
      }
      // Nothing playing at all
      await Promise.all([
        redis.del(`now_playing:${creatorId}`),
        redis.del(`round_ends_at:${creatorId}`),
      ]);
      const queue = await getQueue(creatorId);
      await publishUpdate(creatorId, { type: 'NOW_PLAYING', song: null, remainingMs: null, queue });
      return NextResponse.json({ message: 'Queue empty' });
    }

    // Clean up previous now_playing — Redis only, no DB
    const prevRaw = await redis.get(`now_playing:${creatorId}`);
    if (prevRaw) {
      const prev     = JSON.parse(prevRaw);
      const prevHash = await redis.hGetAll(`song:${prev.id}`);
      await Promise.all([
        prevHash?.addedByUserId
          ? redis.del(`added:${prevHash.addedByUserId}:${creatorId}`)
          : Promise.resolve(),
        redis.del(`song:${prev.id}`),
        redis.sRem(`session_songs:${creatorId}`, prev.id),
      ]);
    }

    const { value: streamId, score } = topSongs[0];
    const songData = await redis.hGetAll(`song:${streamId}`);
    const endsAt   = Date.now() + ROUND_MS;

    const nowPlaying = {
      id:          streamId,
      title:       songData.title       ?? 'Unknown',
      thumbnail:   songData.thumbnail   ?? '',
      extractedId: songData.extractedId ?? '',
      votes:       score,
    };

    await Promise.all([
      redis.zRem(`queue:${creatorId}`,      streamId),
      redis.sRem(`queue_vids:${creatorId}`, songData.extractedId ?? ''),
      redis.set(`now_playing:${creatorId}`,   JSON.stringify(nowPlaying), { EX: TTL }),
      redis.set(`round_ends_at:${creatorId}`, endsAt.toString(),          { EX: TTL }),
    ]);

    const queue = await getQueue(creatorId);
    await publishUpdate(creatorId, { type: 'NOW_PLAYING', song: nowPlaying, remainingMs: ROUND_MS, queue });
    return NextResponse.json({ nowPlaying, endsAt });

  } finally {
    await redis.del(lock);
  }
}
