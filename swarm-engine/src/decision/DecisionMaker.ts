import type { SwarmConsensus, PredictionResult, SignalDirection } from '../../shared/types/MarketData';
import { randomUUID } from 'crypto';

export interface DecisionInput {
  swarmConsensus: SwarmConsensus;
  mlDirection: SignalDirection;
  mlConfidence: number;
  mlProbUp: number;
  llmSentiment?: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
  llmConfidence?: number;
  pair: string;
  horizonMinutes: number;
}

const ML_WEIGHT   = 0.40;
const SWARM_WEIGHT = 0.40;
const LLM_WEIGHT  = 0.20;

export class DecisionMaker {
  decide(input: DecisionInput): PredictionResult {
    const mlScore = this.dirToScore(input.mlDirection) * input.mlConfidence;
    const swarmScore = this.dirToScore(input.swarmConsensus.direction) * input.swarmConsensus.confidence;

    let llmScore = 0;
    if (input.llmSentiment && input.llmConfidence) {
      const sentMap = { BULLISH: 1, NEUTRAL: 0, BEARISH: -1 } as const;
      llmScore = sentMap[input.llmSentiment] * input.llmConfidence;
    }

    const llmActive = input.llmSentiment !== undefined ? LLM_WEIGHT : 0;
    const totalWeight = ML_WEIGHT + SWARM_WEIGHT + llmActive;

    const compositeScore = (
      mlScore * ML_WEIGHT +
      swarmScore * SWARM_WEIGHT +
      llmScore * llmActive
    ) / totalWeight;

    const direction = this.scoreToDir(compositeScore);
    const confidence = Math.min(0.95, Math.abs(compositeScore));

    // Desacuerdo entre ML y Swarm reduce confianza
    if (
      this.dirToScore(input.mlDirection) !== 0 &&
      this.dirToScore(input.swarmConsensus.direction) !== 0 &&
      Math.sign(mlScore) !== Math.sign(swarmScore)
    ) {
      const adjustedConfidence = confidence * 0.6;
      return this.buildResult(input, direction, adjustedConfidence, compositeScore, 'ML y Swarm en desacuerdo — confianza reducida');
    }

    const reasoning = this.buildReasoning(input, compositeScore, direction);
    return this.buildResult(input, direction, confidence, compositeScore, reasoning);
  }

  private buildResult(
    input: DecisionInput,
    direction: SignalDirection,
    confidence: number,
    compositeScore: number,
    reasoning: string,
  ): PredictionResult {
    return {
      id: randomUUID(),
      timestamp: Date.now(),
      pair: input.pair,
      timeframe: '15m',
      horizonMinutes: input.horizonMinutes,
      direction,
      confidence,
      volatilityEstimate: Math.abs(compositeScore) * 0.02,
      signals: [],
      swarmConsensus: input.swarmConsensus,
      reasoning,
    };
  }

  private buildReasoning(input: DecisionInput, score: number, direction: SignalDirection): string {
    const parts: string[] = [];
    parts.push(`Decisión: ${direction} con score compuesto ${score.toFixed(3)}.`);
    parts.push(`ML (${input.mlDirection} ${(input.mlConfidence * 100).toFixed(0)}%)`);
    parts.push(`Swarm (${input.swarmConsensus.direction} ${(input.swarmConsensus.confidence * 100).toFixed(0)}% — convergencia ${(input.swarmConsensus.convergenceScore * 100).toFixed(0)}%)`);
    if (input.llmSentiment) {
      parts.push(`LLM (${input.llmSentiment} ${((input.llmConfidence ?? 0) * 100).toFixed(0)}%)`);
    }
    return parts.join(' | ');
  }

  private dirToScore(dir: SignalDirection): number {
    return dir === 'UP' ? 1 : dir === 'DOWN' ? -1 : 0;
  }

  private scoreToDir(score: number): SignalDirection {
    if (score > 0.12) return 'UP';
    if (score < -0.12) return 'DOWN';
    return 'NEUTRAL';
  }
}
