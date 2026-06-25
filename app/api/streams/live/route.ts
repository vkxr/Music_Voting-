import { redis } from '@/lib/redis';
import { getQueue } from '@/lib/queue';
import { NextRequest } from 'next/server';

export const dynamic = 'force-dynamic';

interface PubSubClient {
  connect(): Promise<void>;
  subscribe(channel: string, listener: (message: string) => void): Promise<unknown>;
  unsubscribe(channel?: string): Promise<unknown>;
  disconnect(): Promise<void>;
}

export async function GET(req: NextRequest) {
  const creatorId = req.nextUrl.searchParams.get('creatorId');
  if (!creatorId) return new Response('Missing creatorId', { status: 400 });

  const encoder = new TextEncoder();
  let subscriber: PubSubClient | null = null;

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

      const endsAtMs    = endsAtRaw ? parseInt(endsAtRaw) : null;
      const remainingMs = endsAtMs  ? Math.max(0, endsAtMs - Date.now()) : null;

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

      subscriber = redis.duplicate() as unknown as PubSubClient;
      await subscriber.connect();
      await subscriber.subscribe(`updates:${creatorId}`, (message: string) => {
        send(JSON.parse(message));
      });

      req.signal.addEventListener('abort', () => { clearInterval(ping); });
    },

    async cancel() {
      try {
        await subscriber?.unsubscribe();
        await subscriber?.disconnect();
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
