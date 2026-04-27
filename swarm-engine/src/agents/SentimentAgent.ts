import type { LLMContext } from '../../shared/types/MarketData';

export class SentimentAgent {
  readonly id = 'sentiment-agent';
  readonly type = 'SENTIMENT';
  readonly weight = 0.25;

  evaluate(llmContext: LLMContext | null): { score: number; confidence: number } {
    if (!llmContext) return { score: 0, confidence: 0.1 };

    const sentimentMap = { BULLISH: 1, NEUTRAL: 0, BEARISH: -1 } as const;
    const baseScore = sentimentMap[llmContext.sentiment] ?? 0;

    const impactMultiplier = llmContext.impactLevel === 'HIGH' ? 1.0
      : llmContext.impactLevel === 'MEDIUM' ? 0.6 : 0.3;

    const eventBoost = llmContext.events
      .filter((e) => e.severity > 0.5)
      .reduce((acc, e) => {
        const dir = e.expectedImpact === 'UP' ? 1 : e.expectedImpact === 'DOWN' ? -1 : 0;
        return acc + dir * e.severity * 0.2;
      }, 0);

    const score = Math.max(-1, Math.min(1, baseScore * impactMultiplier + eventBoost));
    const confidence = llmContext.confidence * (llmContext.impactLevel === 'LOW' ? 0.5 : 1.0);

    return { score, confidence };
  }
}
