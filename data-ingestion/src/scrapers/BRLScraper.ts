import { ExchangeRate } from '../../shared/types/MarketData';
import { createLogger } from '../../shared/utils/logger';

const logger = createLogger('brl-scraper');

interface AwesomeAPIResponse {
  USDBRL: { bid: string; ask: string; timestamp: string };
}

export class BRLScraper {
  private readonly url = 'https://economia.awesomeapi.com.br/json/last/USD-BRL,ARS-BRL';

  async fetch(): Promise<ExchangeRate[]> {
    try {
      const res = await fetch(this.url, { signal: AbortSignal.timeout(8_000) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json() as AwesomeAPIResponse;

      const now = Date.now();
      const results: ExchangeRate[] = [];

      if (data.USDBRL) {
        const bid = parseFloat(data.USDBRL.bid);
        const ask = parseFloat(data.USDBRL.ask);
        results.push({
          base: 'USD',
          quote: 'BRL',
          rate: (bid + ask) / 2,
          marketType: 'official',
          spread: ask - bid,
          timestamp: now,
          source: this.url,
        });
      }

      return results;
    } catch (err) {
      logger.error('BRL fetch failed', err);
      return [];
    }
  }
}
