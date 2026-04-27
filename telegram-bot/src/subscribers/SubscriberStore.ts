import { createClient, RedisClientType } from 'redis';
import { createLogger } from '../../shared/utils/logger';

const logger = createLogger('subscriber-store');
const REDIS_KEY = 'telegram:subscribers';

let redis: RedisClientType | null = null;

async function getRedis(): Promise<RedisClientType> {
  if (redis) return redis;
  redis = createClient({ url: process.env.REDIS_URL ?? 'redis://localhost:6379' }) as RedisClientType;
  redis.on('error', (e) => logger.error('Redis error', e));
  await redis.connect();
  return redis;
}

export class SubscriberStore {
  async add(chatId: number, username?: string): Promise<boolean> {
    const r = await getRedis();
    const meta = JSON.stringify({ chatId, username: username ?? '', joinedAt: Date.now() });
    const added = await r.hSetNX(REDIS_KEY, String(chatId), meta);
    if (added) logger.info('New subscriber', { chatId, username });
    return added;
  }

  async remove(chatId: number): Promise<void> {
    const r = await getRedis();
    await r.hDel(REDIS_KEY, String(chatId));
    logger.info('Subscriber removed', { chatId });
  }

  async isSubscribed(chatId: number): Promise<boolean> {
    const r = await getRedis();
    return await r.hExists(REDIS_KEY, String(chatId));
  }

  async getAll(): Promise<number[]> {
    const r = await getRedis();
    const all = await r.hGetAll(REDIS_KEY);
    return Object.keys(all).map(Number).filter(Boolean);
  }

  async count(): Promise<number> {
    const r = await getRedis();
    return await r.hLen(REDIS_KEY);
  }
}
