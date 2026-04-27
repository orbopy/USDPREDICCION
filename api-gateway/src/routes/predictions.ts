import { Router, Request, Response } from 'express';
import { createClient } from 'redis';
import type { PredictionResult } from '../../shared/types/MarketData';

const router = Router();
const redis = createClient({ url: process.env.REDIS_URL ?? 'redis://localhost:6379' });
redis.connect().catch(console.error);

const HISTORY_KEY = 'predictions:history';
const MAX_HISTORY = 200;

// Store incoming predictions for history
export async function storePrediction(prediction: PredictionResult): Promise<void> {
  await redis.lPush(HISTORY_KEY, JSON.stringify(prediction));
  await redis.lTrim(HISTORY_KEY, 0, MAX_HISTORY - 1);
}

// GET /api/predictions — últimas N predicciones
router.get('/', async (_req: Request, res: Response) => {
  try {
    const limit = Math.min(parseInt(_req.query.limit as string ?? '20'), 100);
    const raw = await redis.lRange(HISTORY_KEY, 0, limit - 1);
    const predictions = raw.map((r) => JSON.parse(r) as PredictionResult);
    res.json({ count: predictions.length, predictions });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch predictions' });
  }
});

// GET /api/predictions/latest — última predicción por par
router.get('/latest', async (req: Request, res: Response) => {
  try {
    const pair = (req.query.pair as string) ?? 'USD/ARS';
    const raw = await redis.lRange(HISTORY_KEY, 0, 50);
    const all = raw.map((r) => JSON.parse(r) as PredictionResult);
    const latest = all.find((p) => p.pair === pair);
    if (!latest) return res.status(404).json({ error: `No prediction found for ${pair}` });
    res.json(latest);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch latest prediction' });
  }
});

// GET /api/predictions/stats
router.get('/stats', async (_req: Request, res: Response) => {
  try {
    const raw = await redis.lRange(HISTORY_KEY, 0, 99);
    const predictions = raw.map((r) => JSON.parse(r) as PredictionResult);

    const stats = {
      total: predictions.length,
      byDirection: {
        UP: predictions.filter((p) => p.direction === 'UP').length,
        DOWN: predictions.filter((p) => p.direction === 'DOWN').length,
        NEUTRAL: predictions.filter((p) => p.direction === 'NEUTRAL').length,
      },
      avgConfidence: predictions.reduce((s, p) => s + p.confidence, 0) / (predictions.length || 1),
      byPair: {} as Record<string, number>,
    };

    for (const p of predictions) {
      stats.byPair[p.pair] = (stats.byPair[p.pair] ?? 0) + 1;
    }

    res.json(stats);
  } catch (err) {
    res.status(500).json({ error: 'Failed to compute stats' });
  }
});

export default router;
