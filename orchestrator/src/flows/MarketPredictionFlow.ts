import { DataCollectorAgent } from '../agents/DataCollectorAgent';
import { AlertDispatcherAgent } from '../agents/AlertDispatcherAgent';
import { subscribe } from '../../shared/utils/redis';
import { createLogger } from '../../shared/utils/logger';
import { FLOW_CONFIG } from '../config/agents.config';
import type { PredictionResult } from '../../shared/types/MarketData';

const logger = createLogger('market-prediction-flow');

export class MarketPredictionFlow {
  private dataCollector = new DataCollectorAgent();
  private alertDispatcher = new AlertDispatcherAgent();
  private running = false;
  private intervalHandle: NodeJS.Timeout | null = null;

  async start(): Promise<void> {
    if (this.running) return;
    this.running = true;
    logger.info('MarketPredictionFlow started', { pairs: FLOW_CONFIG.pairs });

    // Listen for final swarm decisions and dispatch alerts
    await subscribe('market:swarm:decision', async (payload: unknown) => {
      const result = payload as PredictionResult;
      if (!result?.direction) return;
      await this.alertDispatcher.dispatch(result).catch((e) => logger.error('Alert dispatch failed', e));
    });

    // Periodically trigger ML predictions for all pairs
    this.intervalHandle = setInterval(async () => {
      const { triggered, errors } = await this.dataCollector.run(FLOW_CONFIG.pairs);
      if (errors.length > 0) logger.warn('Some pairs failed ML trigger', { errors });
      if (triggered.length > 0) logger.info('ML triggered for pairs', { triggered });
    }, 2 * 60 * 1000);

    // First run immediately
    await this.dataCollector.run(FLOW_CONFIG.pairs).catch((e) => logger.warn('Initial ML trigger failed', e));
  }

  stop(): void {
    if (this.intervalHandle) clearInterval(this.intervalHandle);
    this.running = false;
    logger.info('MarketPredictionFlow stopped');
  }
}
