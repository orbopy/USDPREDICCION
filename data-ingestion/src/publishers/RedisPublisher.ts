import { ExchangeRate, NewsItem, MarketSnapshot } from '../../shared/types/MarketData';
import { publish } from '../../shared/utils/redis';
import { createLogger } from '../../shared/utils/logger';

const logger = createLogger('redis-publisher');

export const CHANNELS = {
  RATES: 'market:rates',
  NEWS: 'market:news',
  SNAPSHOT: 'market:snapshot',
} as const;

export class RedisPublisher {
  async publishRates(rates: ExchangeRate[]): Promise<void> {
    if (rates.length === 0) return;
    await publish(CHANNELS.RATES, rates);
    logger.debug(`Published ${rates.length} rates`);
  }

  async publishNews(items: NewsItem[]): Promise<void> {
    if (items.length === 0) return;
    await publish(CHANNELS.NEWS, items);
    logger.debug(`Published ${items.length} news items`);
  }

  async publishSnapshot(snapshot: MarketSnapshot): Promise<void> {
    await publish(CHANNELS.SNAPSHOT, snapshot);
    logger.info('Market snapshot published', { id: snapshot.id, rateCount: snapshot.rates.length });
  }
}
