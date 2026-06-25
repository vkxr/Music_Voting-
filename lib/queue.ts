import { redis } from './redis';
import { QueueItem } from '@/app/types/Music';

export async function getQueue(creatorId: string): Promise<QueueItem[]> {
  const members = await redis.zRangeWithScores(`queue:${creatorId}`, 0, -1, { REV: true });
  if (!members.length) return [];

  const items = await Promise.all(
    members.map(async ({ value: streamId, score }) => {
      const data = await redis.hGetAll(`song:${streamId}`);
      return {
        id: streamId,
        title: data.title ?? 'Unknown',
        thumbnail: data.thumbnail ?? '',
        extractedId: data.extractedId ?? '',
        votes: score,
      };
    })
  );

  return items;
}

export async function publishUpdate(creatorId: string, event: object) {
  await redis.publish(`updates:${creatorId}`, JSON.stringify(event));
}
