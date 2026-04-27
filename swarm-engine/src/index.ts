import { SwarmEngine } from './core/SwarmEngine';
import { TrendAgent } from './agents/TrendAgent';
import { SentimentAgent } from './agents/SentimentAgent';
import { VolumeAgent } from './agents/VolumeAgent';
import { MacroAgent } from './agents/MacroAgent';
import { DecisionMaker } from './decision/DecisionMaker';
import { subscribe, publish } from '../shared/utils/redis';
import { createLogger } from '../shared/utils/logger';
import type { MarketSnapshot, LLMContext, SwarmConsensus } from '../shared/types/MarketData';

const logger = createLogger('swarm-engine');

const swarm = new SwarmEngine({ particles: 16, maxIterations: 60 });
const trendAgent = new TrendAgent();
const sentimentAgent = new SentimentAgent();
const volumeAgent = new VolumeAgent();
const macroAgent = new MacroAgent();
const decisionMaker = new DecisionMaker();

const SWARM_OUTPUT_CHANNEL = 'market:swarm:decision';
const ML_CHANNEL = 'market:ml:prediction';
const LLM_CHANNEL = 'market:llm:context';
const SNAPSHOT_CHANNEL = 'market:snapshot';

const state: {
  snapshots: MarketSnapshot[];
  llmContext: LLMContext | null;
  mlResult: { direction: string; confidence: number; prob_up: number; pair: string } | null;
} = { snapshots: [], llmContext: null, mlResult: null };

async function runSwarm(): Promise<void> {
  if (state.snapshots.length < 3) {
    logger.debug('Not enough snapshots yet', { count: state.snapshots.length });
    return;
  }

  const trendEval     = trendAgent.evaluate(state.snapshots);
  const sentimentEval = sentimentAgent.evaluate(state.llmContext);
  const volumeEval    = volumeAgent.evaluate(state.snapshots);
  const macroEval     = macroAgent.evaluate({
    brechaCambiaria: estimateBrecha(state.snapshots),
  }, state.llmContext);

  const agentInputs = [
    { id: trendAgent.id,     type: trendAgent.type,     ...trendEval,     weight: trendAgent.weight },
    { id: sentimentAgent.id, type: sentimentAgent.type, ...sentimentEval, weight: sentimentAgent.weight },
    { id: volumeAgent.id,    type: volumeAgent.type,    ...volumeEval,    weight: volumeAgent.weight },
    { id: macroAgent.id,     type: macroAgent.type,     ...macroEval,     weight: macroAgent.weight },
  ];

  const consensus: SwarmConsensus = swarm.optimize(agentInputs);

  logger.info('Swarm consensus', {
    direction: consensus.direction,
    confidence: consensus.confidence.toFixed(3),
    convergence: consensus.convergenceScore.toFixed(3),
    iterations: consensus.iterationsRun,
  });

  if (state.mlResult) {
    const decision = decisionMaker.decide({
      swarmConsensus: consensus,
      mlDirection: state.mlResult.direction as 'UP' | 'DOWN' | 'NEUTRAL',
      mlConfidence: state.mlResult.confidence,
      mlProbUp: state.mlResult.prob_up,
      llmSentiment: state.llmContext?.sentiment,
      llmConfidence: state.llmContext?.confidence,
      pair: state.mlResult.pair,
      horizonMinutes: 15,
    });

    await publish(SWARM_OUTPUT_CHANNEL, decision);
    logger.info('Final decision published', {
      pair: decision.pair,
      direction: decision.direction,
      confidence: decision.confidence.toFixed(3),
    });
  } else {
    // Sin ML, publicamos solo el consenso del swarm
    await publish(SWARM_OUTPUT_CHANNEL, { swarmOnly: true, consensus });
  }
}

function estimateBrecha(snapshots: MarketSnapshot[]): number {
  const latest = snapshots[snapshots.length - 1];
  const blue = latest.rates.find((r) => r.base === 'USD' && r.quote === 'ARS' && r.marketType === 'blue')?.rate;
  const official = latest.rates.find((r) => r.base === 'USD' && r.quote === 'ARS' && r.marketType === 'official')?.rate;
  if (blue && official && official > 0) return ((blue - official) / official) * 100;
  return 0;
}

async function main() {
  logger.info('Swarm engine starting');

  await subscribe(SNAPSHOT_CHANNEL, (payload: unknown) => {
    const snap = payload as MarketSnapshot;
    state.snapshots.push(snap);
    if (state.snapshots.length > 100) state.snapshots.shift();
    runSwarm().catch((e) => logger.error('Swarm run error', e));
  });

  await subscribe(LLM_CHANNEL, (payload: unknown) => {
    state.llmContext = payload as LLMContext;
    logger.debug('LLM context updated', { sentiment: state.llmContext.sentiment });
  });

  await subscribe(ML_CHANNEL, (payload: unknown) => {
    state.mlResult = payload as typeof state.mlResult;
    logger.debug('ML result updated', { direction: state.mlResult?.direction });
    runSwarm().catch((e) => logger.error('Swarm run after ML error', e));
  });

  logger.info('Swarm engine listening on Redis channels');
}

main().catch((err) => {
  logger.error('Fatal error', err);
  process.exit(1);
});
