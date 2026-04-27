import { createLogger } from '../../shared/utils/logger';
import { publish } from '../../shared/utils/redis';

const logger = createLogger('data-collector-agent');

const ML_SERVICE_URL = process.env.ML_SERVICE_URL ?? 'http://localhost:8001';

export class DataCollectorAgent {
  readonly id = 'data-collector';

  async run(pairs: string[]): Promise<{ triggered: string[]; errors: string[] }> {
    const triggered: string[] = [];
    const errors: string[] = [];

    for (const pair of pairs) {
      try {
        const res = await fetch(`${ML_SERVICE_URL}/predict`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ pair, horizon_minutes: 15 }),
          signal: AbortSignal.timeout(10_000),
        });

        if (res.ok) {
          const prediction = await res.json();
          await publish('market:ml:prediction', prediction);
          triggered.push(pair);
          logger.debug('ML prediction triggered', { pair, direction: prediction.direction });
        } else {
          const body = await res.text();
          logger.warn(`ML predict failed for ${pair}`, { status: res.status, body });
          errors.push(pair);
        }
      } catch (err) {
        logger.warn(`DataCollector error for ${pair}`, err);
        errors.push(pair);
      }
    }

    return { triggered, errors };
  }
}
