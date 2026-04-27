export type Currency = 'ARS' | 'PYG' | 'BRL' | 'USD' | 'EUR';
export type MarketType = 'official' | 'blue' | 'ccl' | 'mep' | 'informal';
export type SignalDirection = 'UP' | 'DOWN' | 'NEUTRAL';
export type Timeframe = '1m' | '5m' | '15m' | '30m' | '1h' | '4h' | '1d';

export interface ExchangeRate {
  base: Currency;
  quote: Currency;
  rate: number;
  marketType: MarketType;
  spread?: number;
  timestamp: number;
  source: string;
}

export interface MarketSnapshot {
  id: string;
  timestamp: number;
  rates: ExchangeRate[];
  volume?: number;
  liquidity?: number;
  region: 'AR' | 'PY' | 'BR' | 'BORDER';
}

export interface OHLCV {
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  timestamp: number;
  pair: string;
}

export interface NewsItem {
  id: string;
  title: string;
  body: string;
  source: string;
  url: string;
  publishedAt: number;
  tags: string[];
  region: string[];
}

export interface MarketSignal {
  id: string;
  timestamp: number;
  pair: string;
  direction: SignalDirection;
  strength: number;        // 0-1
  confidence: number;      // 0-1
  source: 'ML' | 'LLM' | 'SWARM' | 'TECHNICAL';
  metadata: Record<string, unknown>;
  expiresAt: number;
}

export interface PredictionRequest {
  pair: string;
  timeframe: Timeframe;
  horizon: number;         // minutes ahead
  context?: string;
  includeSwarm: boolean;
  includeLLM: boolean;
}

export interface PredictionResult {
  id: string;
  timestamp: number;
  pair: string;
  timeframe: Timeframe;
  horizonMinutes: number;
  direction: SignalDirection;
  confidence: number;
  priceTarget?: number;
  volatilityEstimate: number;
  signals: MarketSignal[];
  swarmConsensus?: SwarmConsensus;
  llmContext?: LLMContext;
  reasoning: string;
}

export interface SwarmConsensus {
  direction: SignalDirection;
  confidence: number;
  agentVotes: AgentVote[];
  convergenceScore: number;
  iterationsRun: number;
}

export interface AgentVote {
  agentId: string;
  agentType: string;
  direction: SignalDirection;
  weight: number;
  confidence: number;
}

export interface LLMContext {
  sentiment: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
  impactLevel: 'HIGH' | 'MEDIUM' | 'LOW';
  events: DetectedEvent[];
  reasoning: string;
  confidence: number;
}

export interface DetectedEvent {
  type: 'POLITICAL' | 'ECONOMIC' | 'SOCIAL' | 'MACRO' | 'RUMOR';
  description: string;
  affectedPairs: string[];
  expectedImpact: SignalDirection;
  severity: number;    // 0-1
}

export interface RedisMessage<T = unknown> {
  channel: string;
  payload: T;
  timestamp: number;
  source: string;
}
