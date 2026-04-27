import { sendMessage } from '../TelegramClient';
import { SubscriberStore } from '../subscribers/SubscriberStore';
import { formatPrediction, formatStatus, formatDailyReport } from '../formatters/messages';
import { createLogger } from '../../shared/utils/logger';
import { createClient } from 'redis';
import type { PredictionResult } from '../../shared/types/MarketData';

const logger = createLogger('command-handler');
const store = new SubscriberStore();
const startTime = Date.now();

const redis = createClient({ url: process.env.REDIS_URL ?? 'redis://localhost:6379' });
redis.connect().catch(console.error);

let lastPrediction: PredictionResult | null = null;
let lastPredictionTs: number | null = null;

export function setLastPrediction(p: PredictionResult): void {
  lastPrediction = p;
  lastPredictionTs = Date.now();
}

const AYUDA_TEXT = `
🤖 *USDPREDICCION Bot*

Comandos disponibles:

/start — Suscribirse a alertas automáticas
/stop — Cancelar suscripción
/prediccion — Ver la última señal generada
/precio — Ver cotizaciones actuales
/informe — Resumen del día
/status — Estado del sistema
/ayuda — Este mensaje

━━━━━━━━━━━━━━━━━━━━
_Sistema: OpenClaw + MiroFish + Gemini_
_Mercados: ARS · BRL · PYG_
`.trim();

export async function handleCommand(
  chatId: number,
  command: string,
  username?: string,
): Promise<void> {
  const cmd = command.split('@')[0].toLowerCase().trim();
  logger.debug(`Command received: ${cmd}`, { chatId, username });

  switch (cmd) {
    case '/start': {
      const isNew = await store.add(chatId, username);
      if (isNew) {
        await sendMessage(chatId, [
          `🚀 *¡Bienvenido a USDPREDICCION!*`,
          ``,
          `Vas a recibir alertas automáticas cuando el sistema detecte una señal de alta confianza en:`,
          `  💵 Dólar blue (USD/ARS)`,
          `  🇧🇷 Real brasileño (USD/BRL)`,
          `  🇵🇾 Guaraní (BRL/PYG)`,
          ``,
          `Usá /ayuda para ver todos los comandos.`,
        ].join('\n'));
      } else {
        await sendMessage(chatId, '✅ Ya estás suscrito. Recibirás alertas automáticamente.\n\nUsá /ayuda para ver los comandos.');
      }
      break;
    }

    case '/stop': {
      await store.remove(chatId);
      await sendMessage(chatId, '🔕 Suscripción cancelada. Dejaste de recibir alertas.\n\nPodés volver a suscribirte con /start.');
      break;
    }

    case '/prediccion': {
      if (!lastPrediction) {
        await sendMessage(chatId, '⏳ Aún no hay predicciones disponibles. El sistema necesita acumular datos.\n\nIntentá en unos minutos.');
        return;
      }
      await sendMessage(chatId, formatPrediction(lastPrediction));
      break;
    }

    case '/precio': {
      try {
        const pairs = ['USD/ARS', 'USD/BRL', 'BRL/PYG'];
        const lines = [`💵 *Cotizaciones actuales*`, ``];

        for (const pair of pairs) {
          const raw = await redis.lRange(`market:rate_history:${pair}`, -1, -1);
          if (raw.length > 0) {
            const rate = JSON.parse(raw[0]) as { close: number; timestamp: number };
            const age = Math.floor((Date.now() - rate.timestamp) / 60000);
            lines.push(`*${pair}:* ${rate.close.toFixed(2)} _(hace ${age} min)_`);
          } else {
            lines.push(`*${pair}:* Sin datos aún`);
          }
        }

        lines.push(``, `_Fuente: dolarapi.com + awesomeapi_`);
        await sendMessage(chatId, lines.join('\n'));
      } catch (err) {
        logger.warn('Error fetching rates for /precio', err);
        await sendMessage(chatId, '❌ Error al obtener cotizaciones. Intentá más tarde.');
      }
      break;
    }

    case '/informe': {
      try {
        const raw = await redis.lRange('predictions:history', 0, 99);
        const predictions = raw.map((r) => JSON.parse(r) as PredictionResult);

        if (predictions.length === 0) {
          await sendMessage(chatId, '⏳ No hay suficientes datos para el informe aún.');
          return;
        }

        const pairCounts: Record<string, number> = {};
        let upCount = 0, downCount = 0, neutralCount = 0;
        let totalConf = 0;

        for (const p of predictions) {
          pairCounts[p.pair] = (pairCounts[p.pair] ?? 0) + 1;
          if (p.direction === 'UP') upCount++;
          else if (p.direction === 'DOWN') downCount++;
          else neutralCount++;
          totalConf += p.confidence;
        }

        const topPair = Object.entries(pairCounts).sort((a, b) => b[1] - a[1])[0]?.[0] ?? 'USD/ARS';

        await sendMessage(chatId, formatDailyReport({
          predictions,
          topPair,
          upCount,
          downCount,
          neutralCount,
          avgConfidence: totalConf / predictions.length,
        }));
      } catch (err) {
        logger.warn('Error generating /informe', err);
        await sendMessage(chatId, '❌ Error al generar el informe.');
      }
      break;
    }

    case '/status': {
      const uptimeSecs = Math.floor((Date.now() - startTime) / 1000);
      const subs = await store.count();
      await sendMessage(chatId, formatStatus({
        uptime: uptimeSecs,
        subscriberCount: subs,
        lastPrediction: lastPrediction ?? undefined,
        lastSignalAgo: lastPredictionTs ? Date.now() - lastPredictionTs : undefined,
      }));
      break;
    }

    case '/ayuda':
    case '/help': {
      await sendMessage(chatId, AYUDA_TEXT);
      break;
    }

    default:
      await sendMessage(chatId, '❓ Comando no reconocido. Usá /ayuda para ver los disponibles.');
  }
}
