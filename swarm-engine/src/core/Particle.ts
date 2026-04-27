import type { SignalDirection, MarketSignal } from '../../shared/types/MarketData';

export interface ParticlePosition {
  bullishScore: number;    // -1 to +1
  confidence: number;      // 0 to 1
  velocity: number;        // rate of change
}

export interface ParticleState {
  id: string;
  agentType: string;
  position: ParticlePosition;
  bestPosition: ParticlePosition;
  bestFitness: number;
  inertia: number;
  cognitiveWeight: number;
  socialWeight: number;
}

export function createParticle(agentId: string, agentType: string): ParticleState {
  const bullish = Math.random() * 2 - 1;
  return {
    id: agentId,
    agentType,
    position: { bullishScore: bullish, confidence: Math.random(), velocity: 0 },
    bestPosition: { bullishScore: bullish, confidence: 0.5, velocity: 0 },
    bestFitness: -Infinity,
    inertia: 0.72,
    cognitiveWeight: 1.49,
    socialWeight: 1.49,
  };
}

export function directionFromScore(score: number): SignalDirection {
  if (score > 0.15) return 'UP';
  if (score < -0.15) return 'DOWN';
  return 'NEUTRAL';
}

export function scoreFromSignals(signals: MarketSignal[]): number {
  if (signals.length === 0) return 0;
  let total = 0;
  let weight = 0;
  for (const s of signals) {
    const dir = s.direction === 'UP' ? 1 : s.direction === 'DOWN' ? -1 : 0;
    total += dir * s.strength * s.confidence;
    weight += s.confidence;
  }
  return weight === 0 ? 0 : total / weight;
}
