import { GeminiClient } from './GeminiClient';
import { buildNewsPrompt } from './prompts/newsAnalysis';
import { subscribe, publish } from '../shared/utils/redis';
import { createLogger } from '../shared/utils/logger';
import type { NewsItem, LLMContext } from '../shared/types/MarketData';

const logger = createLogger('llm-interpreter');
const client = new GeminiClient();

const NEWS_CHANNEL = 'market:news';
const LLM_OUTPUT_CHANNEL = 'market:llm:context';

const BATCH_SIZE = 5;
const BATCH_WINDOW_MS = 30_000;

let pendingNews: NewsItem[] = [];
let batchTimer: NodeJS.Timeout | null = null;

async function processBatch(): Promise<void> {
  if (pendingNews.length === 0) return;

  const batch = pendingNews.splice(0, BATCH_SIZE);
  logger.info(`Processing news batch`, { count: batch.length });

  const prompt = buildNewsPrompt(batch.map((n) => ({ title: n.title, body: n.body, source: n.source })));
  const context: LLMContext | null = await client.analyze(prompt);

  if (context) {
    await publish(LLM_OUTPUT_CHANNEL, context);
    logger.info('LLM context published', { sentiment: context.sentiment, events: context.events.length });
  }
}

async function main() {
  logger.info('LLM interpreter service starting');

  await subscribe(NEWS_CHANNEL, (payload: unknown) => {
    const items = payload as NewsItem[];
    pendingNews.push(...items);

    if (pendingNews.length >= BATCH_SIZE) {
      if (batchTimer) clearTimeout(batchTimer);
      batchTimer = null;
      processBatch().catch((e) => logger.error('Batch processing error', e));
      return;
    }

    if (!batchTimer) {
      batchTimer = setTimeout(() => {
        batchTimer = null;
        processBatch().catch((e) => logger.error('Batch timeout error', e));
      }, BATCH_WINDOW_MS);
    }
  });

  logger.info('Listening for news on Redis channel', { channel: NEWS_CHANNEL });
}

main().catch((err) => {
  logger.error('Fatal error', err);
  process.exit(1);
});
