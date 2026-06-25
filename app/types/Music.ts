export interface QueueItem {
  id: string;
  title: string;
  thumbnail: string;
  extractedId: string;
  votes: number;
}

export type QueueMode = 'public' | 'creator';

export type SSEEvent =
  | { type: 'INIT'; queue: QueueItem[]; nowPlaying: QueueItem | null; remainingMs: number | null; mode: QueueMode }
  | { type: 'QUEUE_UPDATE'; queue: QueueItem[] }
  | { type: 'NOW_PLAYING'; song: QueueItem | null; remainingMs: number | null; queue: QueueItem[] }
  | { type: 'MODE_CHANGE'; mode: QueueMode }
  | { type: 'STREAM_ENDED' };
