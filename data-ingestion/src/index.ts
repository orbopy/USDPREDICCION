import { randomUUID } from 'crypto';
import { DolarBlueScraper } from './scrapers/DolarBlueScraper';
import { BRLScraper } from './scrapers/BRLScraper';
import { PYGScraper } from './scrapers/PYGScraper';
import { NewsAPI } from './apis/NewsAPI';
import { RedisPublisher } from './publishers/RedisPublisher';
import { createLogger } from '../shared/utils/logger';
import type { ExchangeRate, MarketSnapshot } from '../shared/types/MarketData';

const logger = createLogger('data-ingestion');

const RATE_INTERVAL_MS = parseInt(process.env.RATE_INTERVAL_MS ?? '60000');
const NEWS_INTERVAL_MS = parseInt(process.env.NEWS_INTERVAL_MS ?? '300000');

const scrapers = {
  blue: new DolarBlueScraper(),
  brl: new BRLScraper(),
  pyg: new PYGScraper(),
};

const newsApi = new NewsAPI();
const publisher = new RedisPublisher();

async function collectRates(): Promise<void> {
  const [blueRates, brlRates, pygRates] = await Promise.allSettled([
    scrapers.blue.fetch(),
    scrapers.brl.fetch(),
    scrapers.pyg.fetch(),
  ]);

  const rates: ExchangeRate[] = [
    ...(blueRates.status === 'fulfilled' ? blueRates.value : []),
    ...(brlRates.status === 'fulfilled' ? brlRates.value : []),
    ...(pygRates.status === 'fulfilled' ? pygRates.value : []),
  ];

  if (rates.length === 0) {
    logger.warn('No rates collected this cycle');
    return;
  }

  await publisher.publishRates(rates);

  const snapshot: MarketSnapshot = {
    id: randomUUID(),
    timestamp: Date.now(),
    rates,
    region: 'BORDER',
  };
  await publisher.publishSnapshot(snapshot);
}

async function collectNews(): Promise<void> {
  const items = await newsApi.fetchLatest();
  await publisher.publishNews(items);
}

async function main() {
  logger.info('Data ingestion service starting', { rateInterval: RATE_INTERVAL_MS, newsInterval: NEWS_INTERVAL_MS });

  await collectRates().catch((e) => logger.error('Initial rate collection failed', e));
  await collectNews().catch((e) => logger.error('Initial news collection failed', e));

  setInterval(() => collectRates().catch((e) => logger.error('Rate collection error', e)), RATE_INTERVAL_MS);
  setInterval(() => collectNews().catch((e) => logger.error('News collection error', e)), NEWS_INTERVAL_MS);
}

main().catch((err) => {
  logger.error('Fatal error', err);
  process.exit(1);
});
