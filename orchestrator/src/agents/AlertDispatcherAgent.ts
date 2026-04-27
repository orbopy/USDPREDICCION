import { createLogger } from '../../shared/utils/logger';
import { publish } from '../../shared/utils/redis';
import type { PredictionResult } from '../../shared/types/MarketData';

const logger = createLogger('alert-dispatcher');
const ALERT_CHANNEL = 'market:alerts';
const WEBHOOK_URL = process.env.ALERT_WEBHOOK_URL;
const CONFIDENCE_THRESHOLD = parseFloat(process.env.CONFIDENCE_THRESHOLD ?? '0.65');

export class AlertDispatcherAgent {
  readonly id = 'alert-dispatcher';

  async dispatch(prediction: PredictionResult): Promise<void> {
    if (prediction.confidence < CONFIDENCE_THRESHOLD) {
      logger.debug('Prediction below threshold, skipping alert', {
        confidence: prediction.confidence,
        threshold: CONFIDENCE_THRESHOLD,
      });
      return;
    }

    const alert = {
      id: prediction.id,
      timestamp: Date.now(),
      pair: prediction.pair,
      direction: prediction.direction,
      confidence: prediction.confidence,
      horizonMinutes: prediction.horizonMinutes,
      reasoning: prediction.reasoning,
      emoji: prediction.direction === 'UP' ? '🟢' : prediction.direction === 'DOWN' ? '🔴' : '🟡',
    };

    await publish(ALERT_CHANNEL, alert);
    logger.info('Alert dispatched', { pair: alert.pair, direction: alert.direction, confidence: alert.confidence });

    if (WEBHOOK_URL) {
      await this.sendWebhook(alert).catch((e) => logger.warn('Webhook failed', e));
    }
  }

  private async sendWebhook(alert: unknown): Promise<void> {
    await fetch(WEBHOOK_URL!, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(alert),
      signal: AbortSignal.timeout(5_000),
    });
  }
}
