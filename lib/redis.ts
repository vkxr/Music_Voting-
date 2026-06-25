import { createClient } from 'redis';

const globalForRedis = globalThis as unknown as {
  redis: ReturnType<typeof createClient> | undefined;
};

export const redis = globalForRedis.redis ?? createClient({
  username: 'default',
  password: process.env.REDIS_PASSWORD!,
  socket: {
    host: process.env.REDIS_HOST!,
    port: parseInt(process.env.REDIS_PORT ?? '13032'),
    tls: false,
  },
});

redis.on('error', (err) => console.error('Redis Client Error', err));

if (!globalForRedis.redis) {
  globalForRedis.redis = redis;
  redis.connect().catch(console.error);
}
