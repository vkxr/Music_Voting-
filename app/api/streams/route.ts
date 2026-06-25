import { prismaClient } from '@/app/lib/db';
import { redis } from '@/lib/redis';
import { getQueue, publishUpdate } from '@/lib/queue';
import { getServerSession } from 'next-auth';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
// @ts-ignore
import youtubesearchapi from 'youtube-search-api';

const YT_REGEX = /^https?:\/\/(www\.)?youtube\.com\/watch\?v=[\w-]+(&\S*)?$/;
const ROUND_MS  = 5 * 60 * 1000;   // 5 min per round
const ROUND_S   = 5 * 60;
const TTL       = 3600;             // 1 hour — all session keys expire after this

const AddSchema = z.object({ creatorId: z.string(), url: z.string() });

/* Cache user-id by email in Redis to avoid a DB hit on every request */
async function resolveUserId(email: string): Promise<string | null> {
  const key = `uid:${email}`;
  const hit = await redis.get(key);
  if (hit) return hit;
  const user = await prismaClient.user.findFirst({ where: { email }, select: { id: true } });
  if (user) await redis.set(key, user.id, { EX: 86400 });
  return user?.id ?? null;
}

export async function POST(req: NextRequest) {
  const session = await getServerSession();
  if (!session?.user?.email)
    return NextResponse.json({ message: 'Sign in to add songs' }, { status: 401 });

  const userId = await resolveUserId(session.user.email);
  if (!userId) return NextResponse.json({ message: 'User not found' }, { status: 403 });

  let body: z.infer<typeof AddSchema>;
  try { body = AddSchema.parse(await req.json()); }
  catch { return NextResponse.json({ message: 'Invalid request' }, { status: 400 }); }

  const { creatorId, url } = body;
  const isCreator = userId === creatorId;

  // Mode gate
  const mode = (await redis.get(`queue_mode:${creatorId}`)) ?? 'public';
  if (mode === 'creator' && !isCreator)
    return NextResponse.json({ message: 'Queue is locked — creator only' }, { status: 403 });

  // Public users: 1 song per round limit. Creators: unlimited.
  if (!isCreator) {
    const alreadyAdded = await redis.get(`added:${userId}:${creatorId}`);
    if (alreadyAdded)
      return NextResponse.json({ message: 'You already added a song this round. Wait for the next one!' }, { status: 400 });
  }

  if (!YT_REGEX.test(url))
    return NextResponse.json({ message: 'Invalid YouTube URL' }, { status: 400 });

  const extractedId = new URLSearchParams(new URL(url).search).get('v');
  if (!extractedId)
    return NextResponse.json({ message: 'Could not extract video ID' }, { status: 400 });

  const isDup = await redis.sIsMember(`queue_vids:${creatorId}`, extractedId);
  if (isDup)
    return NextResponse.json({ message: 'Song is already in the queue' }, { status: 400 });

  // Fetch YouTube metadata for title only — thumbnail derived from extractedId directly
  const ytRes = await youtubesearchapi.GetVideoDetails(extractedId);
  if (!ytRes?.title)
    return NextResponse.json({ message: 'Failed to fetch video details' }, { status: 500 });

  const title     = ytRes.title as string;
  const thumbnail = `https://img.youtube.com/vi/${extractedId}/hqdefault.jpg`;

  // Pure Redis — no database write for songs
  const streamId = crypto.randomUUID();

  await Promise.all([
    redis.zAdd(`queue:${creatorId}`,          { score: 0, value: streamId }),
    redis.hSet(`song:${streamId}`,            { title, thumbnail, extractedId, addedByUserId: userId }),
    redis.expire(`song:${streamId}`,          TTL),
    redis.sAdd(`queue_vids:${creatorId}`,     extractedId),
    redis.sAdd(`session_songs:${creatorId}`,  streamId),
    redis.expire(`queue:${creatorId}`,        TTL),
    redis.expire(`queue_vids:${creatorId}`,   TTL),
    redis.expire(`session_songs:${creatorId}`,TTL),
    // Rate-limit key only for public users — expires after 2 rounds so they can add again next round
    ...(!isCreator ? [redis.set(`added:${userId}:${creatorId}`, streamId, { EX: ROUND_S * 2 })] : []),
  ]);

  // Auto-start: if nothing is playing yet, immediately play this song
  const current = await redis.get(`now_playing:${creatorId}`);
  if (!current) {
    const endsAt      = Date.now() + ROUND_MS;
    const nowPlaying  = { id: streamId, title, thumbnail, extractedId, votes: 0 };
    await Promise.all([
      redis.set(`now_playing:${creatorId}`,   JSON.stringify(nowPlaying), { EX: TTL }),
      redis.set(`round_ends_at:${creatorId}`, endsAt.toString(),          { EX: TTL }),
      redis.zRem(`queue:${creatorId}`,    streamId),
      redis.sRem(`queue_vids:${creatorId}`,   extractedId),
    ]);
    const queue = await getQueue(creatorId);
    await publishUpdate(creatorId, { type: 'NOW_PLAYING', song: nowPlaying, remainingMs: ROUND_MS, queue });
    return NextResponse.json({ message: 'Song added and now playing', id: streamId }, { status: 201 });
  }

  const queue = await getQueue(creatorId);
  await publishUpdate(creatorId, { type: 'QUEUE_UPDATE', queue });
  return NextResponse.json({ message: 'Song added to queue', id: streamId }, { status: 201 });
}

export async function GET(req: NextRequest) {
  const creatorId = req.nextUrl.searchParams.get('creatorId');
  if (!creatorId) return NextResponse.json({ error: 'Missing creatorId' }, { status: 400 });

  const [queue, nowPlayingRaw, endsAtRaw] = await Promise.all([
    getQueue(creatorId),
    redis.get(`now_playing:${creatorId}`),
    redis.get(`round_ends_at:${creatorId}`),
  ]);

  return NextResponse.json({
    queue,
    nowPlaying: nowPlayingRaw ? JSON.parse(nowPlayingRaw) : null,
    endsAt:     endsAtRaw    ? parseInt(endsAtRaw)        : null,
  });
}
