import { redis } from '@/lib/redis';
import { publishUpdate } from '@/lib/queue';
import { getServerSession } from 'next-auth';
import { prismaClient } from '@/app/lib/db';
import { NextRequest, NextResponse } from 'next/server';
import type { QueueMode } from '@/app/types/Music';

export async function GET(req: NextRequest) {
  const creatorId = req.nextUrl.searchParams.get('creatorId');
  if (!creatorId) return NextResponse.json({ error: 'Missing creatorId' }, { status: 400 });
  const mode = ((await redis.get(`queue_mode:${creatorId}`)) ?? 'public') as QueueMode;
  return NextResponse.json({ mode });
}

export async function POST(req: NextRequest) {
  const session = await getServerSession();
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  // Redis-cached user lookup
  let userId = await redis.get(`uid:${session.user.email}`);
  if (!userId) {
    const user = await prismaClient.user.findFirst({ where: { email: session.user.email }, select: { id: true } });
    if (!user) return NextResponse.json({ error: 'User not found' }, { status: 403 });
    userId = user.id;
    await redis.set(`uid:${session.user.email}`, userId, { EX: 86400 });
  }

  const { creatorId, mode } = await req.json() as { creatorId: string; mode: QueueMode };
  if (userId !== creatorId) return NextResponse.json({ error: 'Not the creator' }, { status: 403 });
  if (mode !== 'public' && mode !== 'creator') return NextResponse.json({ error: 'Invalid mode' }, { status: 400 });

  await redis.set(`queue_mode:${creatorId}`, mode, { EX: 3600 });
  await publishUpdate(creatorId, { type: 'MODE_CHANGE', mode });

  return NextResponse.json({ mode });
}
