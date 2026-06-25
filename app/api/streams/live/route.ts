import { redis } from '@/lib/redis';
import { getQueue } from '@/lib/queue';
import { NextRequest } from 'next/server';
import { createClient } from 'redis';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const creatorId = req.nextUrl.searchParams.get('creatorId');
  if (!creatorId) return new Response('Missing creatorId', { status: 400 });

  const encoder = new TextEncoder();
  let subscriber: ReturnType<typeof createClient> | null = null;

  const stream = new ReadableStream({
    async start(controller) {
      const send = (data: object) => {
        try { controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`)); } catch {}
      };

      const [queue, nowPlayingRaw, endsAtRaw, modeRaw] = await Promise.all([
        getQueue(creatorId),
        redis.get(`now_playing:${creatorId}`),
        redis.get(`round_ends_at:${creatorId}`),
        redis.get(`queue_mode:${creatorId}`),
      ]);

      // Send remainingMs (time left in ms) so client clock sync doesn't matter
      const endsAtMs = endsAtRaw ? parseInt(endsAtRaw) : null;
      const remainingMs = endsAtMs ? Math.max(0, endsAtMs - Date.now()) : null;

      send({
        type: 'INIT',
        queue,
        nowPlaying: nowPlayingRaw ? JSON.parse(nowPlayingRaw) : null,
        remainingMs,
        mode: modeRaw ?? 'public',
      });

      const ping = setInterval(() => {
        try { controller.enqueue(encoder.encode(': ping\n\n')); } catch { clearInterval(ping); }
      }, 25000);

      subscriber = redis.duplicate();
      await (subscriber as any).connect();
      await (subscriber as any).subscribe(`updates:${creatorId}`, (message: string) => {
        send(JSON.parse(message));
      });

      req.signal.addEventListener('abort', () => { clearInterval(ping); });
    },

    async cancel() {
      try {
        await (subscriber as any)?.unsubscribe();
        await (subscriber as any)?.disconnect();
      } catch {}
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
}
