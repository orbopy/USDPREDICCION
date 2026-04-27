import type { MarketSnapshot } from '../../shared/types/MarketData';

export class TrendAgent {
  readonly id = 'trend-agent';
  readonly type = 'TREND';
  readonly weight = 0.30;

  evaluate(snapshots: MarketSnapshot[]): { score: number; confidence: number } {
    if (snapshots.length < 3) return { score: 0, confidence: 0.1 };

    const rates = snapshots
      .flatMap((s) => s.rates)
      .filter((r) => r.base === 'USD' && r.quote === 'ARS')
      .map((r) => r.rate);

    if (rates.length < 3) return { score: 0, confidence: 0.1 };

    const last = rates[rates.length - 1];
    const prev = rates[rates.length - 2];
    const older = rates[0];

    const shortReturn = (last - prev) / prev;
    const longReturn = (last - older) / older;

    const score = shortReturn * 0.7 + longReturn * 0.3;
    const normalized = Math.max(-1, Math.min(1, score * 100));

    const consistency = Math.sign(shortReturn) === Math.sign(longReturn) ? 0.8 : 0.4;

    return { score: normalized, confidence: consistency };
  }
}
