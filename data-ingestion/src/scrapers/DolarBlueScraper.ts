import { ExchangeRate } from '../../shared/types/MarketData';
import { createLogger } from '../../shared/utils/logger';

const logger = createLogger('dolar-blue-scraper');

interface DolarSiResponse {
  casa: { compra: string; venta: string; nombre: string };
}

export class DolarBlueScraper {
  private readonly endpoints = [
    'https://dolarapi.com/v1/dolares/blue',
    'https://api.bluelytics.com.ar/v2/latest',
  ];

  async fetch(): Promise<ExchangeRate[]> {
    for (const url of this.endpoints) {
      try {
        return await this.fetchFrom(url);
      } catch (err) {
        logger.warn(`Endpoint failed: ${url}`, err);
      }
    }
    logger.error('All dolar-blue endpoints failed');
    return [];
  }

  private async fetchFrom(url: string): Promise<ExchangeRate[]> {
    const res = await fetch(url, { signal: AbortSignal.timeout(8_000) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json() as DolarSiResponse;

    const now = Date.now();
    const compra = parseFloat(data.casa?.compra ?? '0');
    const venta = parseFloat(data.casa?.venta ?? '0');
    const mid = (compra + venta) / 2;

    return [
      {
        base: 'USD',
        quote: 'ARS',
        rate: mid,
        marketType: 'blue',
        spread: venta - compra,
        timestamp: now,
        source: url,
      },
    ];
  }
}
