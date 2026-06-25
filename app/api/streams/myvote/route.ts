import { redis } from '@/lib/redis';
import { getServerSession } from 'next-auth';
import { NextRequest, NextResponse } from 'next/server';

function getIp(req: NextRequest): string {
  return req.headers.get('x-forwarded-for')?.split(',')[0].trim() ?? req.headers.get('x-real-ip') ?? 'anon';
}

export async function GET(req: NextRequest) {
  const session = await getServerSession();
  const identifier = session?.user?.email ? `user:${session.user.email}` : `ip:${getIp(req)}`;
  const creatorId = req.nextUrl.searchParams.get('creatorId');
  if (!creatorId) return NextResponse.json({ streamId: null });
  const streamId = await redis.get(`active_vote:${identifier}:${creatorId}`);
  return NextResponse.json({ streamId: streamId ?? null });
}
