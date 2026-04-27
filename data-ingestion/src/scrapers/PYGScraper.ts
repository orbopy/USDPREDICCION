import { ExchangeRate } from '../../shared/types/MarketData';
import { createLogger } from '../../shared/utils/logger';

const logger = createLogger('pyg-scraper');

export class PYGScraper {
  private readonly url = 'https://economia.awesomeapi.com.br/json/last/USD-PYG,BRL-PYG';

  async fetch(): Promise<ExchangeRate[]> {
    try {
      const res = await fetch(this.url, { signal: AbortSignal.timeout(8_000) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json() as Record<string, { bid: string; ask: string }>;

      const now = Date.now();
      const results: ExchangeRate[] = [];

      for (const [pair, quote] of Object.entries(data)) {
        const [base, quoteC] = pair.replace(/([A-Z]{3})([A-Z]{3})/, '$1 $2').split(' ');
        const bid = parseFloat(quote.bid);
        const ask = parseFloat(quote.ask);
        results.push({
          base: base as 'USD' | 'BRL',
          quote: quoteC as 'PYG',
          rate: (bid + ask) / 2,
          marketType: 'official',
          spread: ask - bid,
          timestamp: now,
          source: this.url,
        });
      }

      return results;
    } catch (err) {
      logger.error('PYG fetch failed', err);
      return [];
    }
  }
}
