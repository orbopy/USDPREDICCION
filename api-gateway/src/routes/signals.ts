import { Router, Request, Response } from 'express';
import { createClient } from 'redis';

const router = Router();
const redis = createClient({ url: process.env.REDIS_URL ?? 'redis://localhost:6379' });
redis.connect().catch(console.error);

// GET /api/signals/rates — últimas tasas de cambio
router.get('/rates', async (req: Request, res: Response) => {
  try {
    const pairs = ['USD/ARS', 'USD/BRL', 'BRL/PYG', 'USD/PYG'];
    const rates: Record<string, unknown[]> = {};

    for (const pair of pairs) {
      const raw = await redis.lRange(`market:rate_history:${pair}`, -20, -1);
      rates[pair] = raw.map((r) => JSON.parse(r));
    }

    res.json({ timestamp: Date.now(), rates });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch rates' });
  }
});

// GET /api/signals/alerts — últimas alertas disparadas
router.get('/alerts', async (req: Request, res: Response) => {
  try {
    const limit = Math.min(parseInt(req.query.limit as string ?? '10'), 50);
    const raw = await redis.lRange('alerts:history', 0, limit - 1);
    const alerts = raw.map((r) => JSON.parse(r));
    res.json({ count: alerts.length, alerts });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch alerts' });
  }
});

// GET /api/signals/llm — último contexto LLM
router.get('/llm', async (_req: Request, res: Response) => {
  try {
    const raw = await redis.get('market:llm:latest');
    if (!raw) return res.status(404).json({ error: 'No LLM context available yet' });
    res.json(JSON.parse(raw));
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch LLM context' });
  }
});

export default router;
