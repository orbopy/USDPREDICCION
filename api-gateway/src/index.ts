import http from 'http';
import express from 'express';
import cors from 'cors';
import { RealtimeServer } from './websocket/RealtimeServer';
import predictionsRouter, { storePrediction } from './routes/predictions';
import signalsRouter from './routes/signals';
import healthRouter from './routes/health';
import { subscribe } from '../shared/utils/redis';
import { createLogger } from '../shared/utils/logger';
import type { PredictionResult } from '../shared/types/MarketData';

const logger = createLogger('api-gateway');
const PORT = parseInt(process.env.API_PORT ?? '3001');

const app = express();
app.use(cors());
app.use(express.json());

app.use('/api/predictions', predictionsRouter);
app.use('/api/signals', signalsRouter);
app.use('/api/health', healthRouter);

app.get('/', (_req, res) => res.json({
  service: 'USDPREDICCION API Gateway',
  version: '1.0.0',
  endpoints: ['/api/predictions', '/api/signals', '/api/health', '/ws'],
}));

const server = http.createServer(app);
const realtimeServer = new RealtimeServer(server);

async function main() {
  // Persist predictions to Redis history
  await subscribe('market:swarm:decision', async (payload: unknown) => {
    const prediction = payload as PredictionResult;
    if (prediction?.id) await storePrediction(prediction).catch(console.error);
  });

  await realtimeServer.startRedisRelay();

  server.listen(PORT, () => {
    logger.info(`API Gateway running on port ${PORT}`);
    logger.info(`WebSocket available at ws://localhost:${PORT}/ws`);
  });
}

main().catch((err) => {
  logger.error('Fatal error', err);
  process.exit(1);
});
