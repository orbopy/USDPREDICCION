import { Router } from 'express';
import { createClient } from 'redis';

const router = Router();
const redis = createClient({ url: process.env.REDIS_URL ?? 'redis://localhost:6379' });
redis.connect().catch(console.error);

router.get('/', async (_req, res) => {
  const checks: Record<string, 'ok' | 'error'> = {};

  try {
    await redis.ping();
    checks.redis = 'ok';
  } catch {
    checks.redis = 'error';
  }

  const allOk = Object.values(checks).every((v) => v === 'ok');
  res.status(allOk ? 200 : 503).json({
    status: allOk ? 'healthy' : 'degraded',
    timestamp: Date.now(),
    checks,
    version: process.env.npm_package_version ?? '1.0.0',
  });
});

export default router;
