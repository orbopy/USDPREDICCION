import { getUpdates, sendToMany, setMyCommands } from './TelegramClient';
import { handleCommand, setLastPrediction } from './commands/CommandHandler';
import { handleOwnerMessage, handleOwnerCommand, isOwner, initOwnerResponseListener } from './commands/OwnerCommands';
import { SubscriberStore } from './subscribers/SubscriberStore';
import { formatAlert, formatLLMContext, formatPrediction } from './formatters/messages';
import { subscribe } from '../shared/utils/redis';
import { createLogger } from '../shared/utils/logger';
import type { PredictionResult, LLMContext } from '../shared/types/MarketData';

const logger = createLogger('telegram-bot');
const store = new SubscriberStore();

const ALERT_CONFIDENCE_MIN = parseFloat(process.env.TELEGRAM_ALERT_CONFIDENCE ?? '0.70');
const DAILY_REPORT_HOUR    = parseInt(process.env.DAILY_REPORT_HOUR ?? '20');

// ─── Long polling ──────────────────────────────────────────────────────────
async function startPolling(): Promise<void> {
  let offset = 0;
  logger.info('Telegram polling started');

  while (true) {
    try {
      const updates = await getUpdates(offset);

      for (const update of updates) {
        offset = update.update_id + 1;
        const msg = update.message;
        if (!msg?.text) continue;

        const chatId  = msg.chat.id;
        const text    = msg.text.trim();
        const owner   = isOwner(chatId);

        if (text.startsWith('/')) {
          // Comandos exclusivos del dueño
          if (owner && ['/agentes', '/openclaw', '/predecir', '/analizar'].some((c) => text.startsWith(c))) {
            await handleOwnerCommand(chatId, text).catch((e) => logger.warn('Owner command error', e));
          } else {
            // Comandos normales (cualquier usuario)
            await handleCommand(chatId, text, msg.from?.username).catch((e) => logger.warn('Command error', e));
          }
        } else if (owner) {
          // Mensaje de texto del dueño (sin slash) → busca URLs para analizar
          await handleOwnerMessage(chatId, text).catch((e) => logger.warn('Owner message error', e));
        }
      }
    } catch (err) {
      logger.warn('Polling error, retrying in 5s', err);
      await sleep(5_000);
    }
  }
}

// ─── Redis → Telegram relay ────────────────────────────────────────────────
async function startRedisListeners(): Promise<void> {

  // Alertas de alta confianza → todos los suscriptores
  await subscribe('market:alerts', async (payload: unknown) => {
    const alert = payload as {
      pair: string; direction: string; confidence: number;
      horizonMinutes: number; reasoning: string; emoji: string;
    };

    if (alert.confidence < ALERT_CONFIDENCE_MIN) return;

    const text = formatAlert(alert);
    const subs = await store.getAll();
    if (subs.length === 0) return;

    logger.info('Broadcasting alert', { pair: alert.pair, direction: alert.direction, subscribers: subs.length });
    await sendToMany(subs, text);
  });

  // Predicción completa (swarm) → broadcast
  await subscribe('market:swarm:decision', async (payload: unknown) => {
    const prediction = payload as PredictionResult;
    if (!prediction?.direction) return;

    setLastPrediction(prediction);

    if (prediction.confidence >= ALERT_CONFIDENCE_MIN) {
      const text = formatPrediction(prediction);
      const subs = await store.getAll();
      await sendToMany(subs, text);
    }
  });

  // Contexto LLM con impacto alto → broadcast
  await subscribe('market:llm:context', async (payload: unknown) => {
    const ctx = payload as LLMContext;
    if (ctx.impactLevel !== 'HIGH' || ctx.confidence < 0.6) return;

    const text = formatLLMContext(ctx);
    const subs = await store.getAll();
    if (subs.length === 0) return;

    logger.info('Broadcasting HIGH impact LLM event', { sentiment: ctx.sentiment });
    await sendToMany(subs, text);
  });

  // Respuestas del Orchestrator → dueño (canal bidireccional)
  await initOwnerResponseListener();

  logger.info('Redis → Telegram relay active');
}

// ─── Informe diario automático ─────────────────────────────────────────────
function scheduleDailyReport(): void {
  const msUntilReport = () => {
    const now = new Date();
    const target = new Date();
    target.setHours(DAILY_REPORT_HOUR, 0, 0, 0);
    const diffMs = target.getTime() - now.getTime() - 3 * 60 * 60 * 1000;
    return diffMs > 0 ? diffMs : diffMs + 24 * 60 * 60 * 1000;
  };

  const scheduleNext = () => {
    const delay = msUntilReport();
    logger.info(`Daily report scheduled in ${(delay / 3600000).toFixed(1)}h`);
    setTimeout(async () => {
      const subs = await store.getAll();
      if (subs.length > 0) {
        await handleCommand(subs[0], '/informe').catch(() => null);
      }
      scheduleNext();
    }, delay);
  };

  scheduleNext();
}

// ─── Registro de comandos en Telegram ─────────────────────────────────────
async function registerCommands(): Promise<void> {
  // Comandos públicos ya registrados en setMyCommands() del TelegramClient
  // Aquí añadimos los del dueño al mismo set
  const { setMyCommands: set } = await import('./TelegramClient');
  await set();
}

// ─── Main ──────────────────────────────────────────────────────────────────
async function main() {
  if (!process.env.TELEGRAM_BOT_TOKEN) {
    logger.error('TELEGRAM_BOT_TOKEN not set');
    process.exit(1);
  }

  const ownerId = process.env.TELEGRAM_OWNER_ID;
  logger.info('Telegram bot starting', {
    alertThreshold: ALERT_CONFIDENCE_MIN,
    dailyReportHour: DAILY_REPORT_HOUR,
    ownerConfigured: !!ownerId,
  });

  await registerCommands();
  await startRedisListeners();
  scheduleDailyReport();

  startPolling().catch((e) => {
    logger.error('Polling fatal error', e);
    process.exit(1);
  });

  logger.info('Bot @usdprediccion_bot running — owner bridge active');
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
