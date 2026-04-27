import { createClient, RedisClientType } from 'redis';
import { createLogger } from './logger';

const logger = createLogger('redis-client');

let client: RedisClientType | null = null;

export async function getRedisClient(): Promise<RedisClientType> {
  if (client) return client;

  client = createClient({ url: process.env.REDIS_URL ?? 'redis://localhost:6379' }) as RedisClientType;

  client.on('error', (err) => logger.error('Redis client error', err));
  client.on('reconnecting', () => logger.warn('Redis reconnecting'));

  await client.connect();
  logger.info('Redis connected');
  return client;
}

export async function publish(channel: string, payload: unknown): Promise<void> {
  const redis = await getRedisClient();
  await redis.publish(channel, JSON.stringify({ channel, payload, timestamp: Date.now() }));
}

export async function subscribe(channel: string, handler: (payload: unknown) => void): Promise<void> {
  const sub = (await getRedisClient()).duplicate() as RedisClientType;
  await sub.connect();
  await sub.subscribe(channel, (message) => {
    try {
      const parsed = JSON.parse(message);
      handler(parsed.payload ?? parsed);
    } catch {
      logger.warn('Failed to parse Redis message', { channel, message });
    }
  });
}
