import { AgentRouter } from './router/AgentRouter';
import { MarketPredictionFlow } from './flows/MarketPredictionFlow';
import { OwnerCommandFlow } from './flows/OwnerCommandFlow';
import { DataCollectorAgent } from './agents/DataCollectorAgent';
import { AGENTS_CONFIG, FLOW_CONFIG } from './config/agents.config';
import { createLogger } from '../shared/utils/logger';

const logger = createLogger('orchestrator');

async function main() {
  logger.info('Orchestrator starting', { pairs: FLOW_CONFIG.pairs });

  const router = new AgentRouter();
  const dataCollector = new DataCollectorAgent();
  const flow = new MarketPredictionFlow();
  const ownerFlow = new OwnerCommandFlow();

  // Register scheduled agents
  router.register(AGENTS_CONFIG.dataCollector, () =>
    dataCollector.run(FLOW_CONFIG.pairs).then((r) => {
      logger.info('DataCollector cycle done', r);
      return r;
    })
  );

  // Start market prediction flow
  await flow.start();

  // Start owner command flow (bot ↔ orchestrator bridge)
  await ownerFlow.start();
  logger.info('Owner command channel active — bot can now send analysis requests');

  // Start router (manages agent scheduling)
  await router.start();

  const shutdown = async () => {
    logger.info('Shutting down orchestrator...');
    flow.stop();
    router.stop();
    process.exit(0);
  };

  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);

  logger.info('Orchestrator running');
}

main().catch((err) => {
  console.error('Fatal orchestrator error:', err);
  process.exit(1);
});
