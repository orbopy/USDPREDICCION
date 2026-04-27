import type { MarketSnapshot, ExchangeRate } from '../../shared/types/MarketData';

export class VolumeAgent {
  readonly id = 'volume-agent';
  readonly type = 'VOLUME';
  readonly weight = 0.20;

  evaluate(snapshots: MarketSnapshot[]): { score: number; confidence: number } {
    if (snapshots.length < 2) return { score: 0, confidence: 0.1 };

    const spreads = snapshots
      .flatMap((s) => s.rates)
      .filter((r): r is ExchangeRate & { spread: number } => r.spread !== undefined)
      .map((r) => r.spread);

    if (spreads.length < 2) return { score: 0, confidence: 0.2 };

    const avgSpread = spreads.reduce((a, b) => a + b, 0) / spreads.length;
    const lastSpread = spreads[spreads.length - 1];
    const spreadRatio = lastSpread / avgSpread;

    // Spread alto → incertidumbre → presión alcista en dolar blue
    let score = 0;
    if (spreadRatio > 1.5) score = 0.7;
    else if (spreadRatio > 1.2) score = 0.4;
    else if (spreadRatio < 0.8) score = -0.3;

    // Consistencia: cuántos snapshots consecutivos muestran spread creciente
    let growingCount = 0;
    for (let i = 1; i < Math.min(spreads.length, 5); i++) {
      if (spreads[spreads.length - i] > spreads[spreads.length - i - 1]) growingCount++;
    }
    const confidence = 0.3 + (growingCount / 4) * 0.5;

    return { score, confidence };
  }
}
