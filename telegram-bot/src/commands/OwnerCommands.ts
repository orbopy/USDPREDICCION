import { randomUUID } from 'crypto';
import { sendMessage } from '../TelegramClient';
import { publish, subscribe } from '../../shared/utils/redis';
import { createLogger } from '../../shared/utils/logger';
import type { OwnerCommand, OwnerResponse } from '../../orchestrator/src/flows/OwnerCommandFlow';

const logger = createLogger('owner-commands');

const OWNER_CHAT_ID = parseInt(process.env.TELEGRAM_OWNER_ID ?? '0');
const OWNER_CMD_CHANNEL  = 'owner:command';
const OWNER_RESP_CHANNEL = 'owner:response';

// Pending requests: requestId → resolve function
const pending = new Map<string, NodeJS.Timeout>();

export function isOwner(chatId: number): boolean {
  return OWNER_CHAT_ID !== 0 && chatId === OWNER_CHAT_ID;
}

// Inicializa el listener de respuestas del orquestador (llamar una sola vez)
export async function initOwnerResponseListener(): Promise<void> {
  await subscribe(OWNER_RESP_CHANNEL, async (payload: unknown) => {
    const resp = payload as OwnerResponse;
    if (!resp?.chatId || !resp?.requestId) return;

    // Limpiar timeout si había
    const timeout = pending.get(resp.requestId);
    if (timeout) {
      clearTimeout(timeout);
      pending.delete(resp.requestId);
    }

    if (resp.status === 'PROCESSING') {
      await sendMessage(resp.chatId, '⏳ _OpenClaw procesando..._');
      return;
    }

    await formatAndSend(resp);
  });

  logger.info('Owner response listener active');
}

async function sendOwnerCommand(cmd: Omit<OwnerCommand, 'requestId' | 'sentAt'>): Promise<void> {
  const requestId = randomUUID();
  const full: OwnerCommand = { ...cmd, requestId, sentAt: Date.now() };

  // Timeout de seguridad: si no responde en 60s avisamos
  const timeout = setTimeout(async () => {
    pending.delete(requestId);
    await sendMessage(cmd.chatId, '⚠️ OpenClaw no respondió en 60 segundos. Revisá los logs.');
  }, 60_000);

  pending.set(requestId, timeout);
  await publish(OWNER_CMD_CHANNEL, full);
}

// ─── Formateadores de respuesta ────────────────────────────────────────────

async function formatAndSend(resp: OwnerResponse): Promise<void> {
  if (resp.status === 'ERROR') {
    await sendMessage(resp.chatId, `❌ *Error en OpenClaw*\n\n\`${resp.error}\``);
    return;
  }

  switch (resp.type) {
    case 'ANALYZE_LINKS':
      await sendLinkAnalysis(resp.chatId, resp.data as BatchResult);
      break;
    case 'FORCE_PREDICT':
      await sendMessage(resp.chatId, `✅ ${(resp.data as { message: string }).message}`);
      break;
    case 'STATUS':
      await sendOrchestratorStatus(resp.chatId, resp.data as StatusData);
      break;
    case 'LIST_AGENTS':
      await sendAgentList(resp.chatId, resp.data as AgentListData);
      break;
  }
}

interface BatchResult {
  urls: string[];
  individual: Array<{
    url: string; title: string; sentiment: string;
    impactLevel: string; confidence: number;
    keyPoints: string[]; priceDirectionReasoning: string;
    affectedPairs: string[]; dataType: string; error?: string;
  }>;
  consolidated: {
    overallSentiment: string; confidence: number;
    topInsights: string[]; recommendation: string; affectedPairs: string[];
  };
}

function confidenceBar(c: number): string {
  const filled = Math.round(c * 10);
  return '█'.repeat(filled) + '░'.repeat(10 - filled);
}

function pct(n: number): string { return `${(n * 100).toFixed(1)}%`; }

async function sendLinkAnalysis(chatId: number, result: BatchResult): Promise<void> {
  const sentEmoji = result.consolidated.overallSentiment === 'BULLISH' ? '🟢'
    : result.consolidated.overallSentiment === 'BEARISH' ? '🔴' : '🟡';

  // Mensaje 1: Resumen consolidado
  const summary = [
    `🦞 *OpenClaw — Análisis completado*`,
    `📎 ${result.urls.length} fuente(s) procesada(s)`,
    ``,
    `${sentEmoji} *Sentimiento general: ${result.consolidated.overallSentiment}*`,
    `🎯 Confianza: ${pct(result.consolidated.confidence)} ${confidenceBar(result.consolidated.confidence)}`,
    `💱 Pares afectados: ${result.consolidated.affectedPairs.join(', ') || 'N/A'}`,
    ``,
    `📌 *Puntos clave:*`,
    ...result.consolidated.topInsights.map((i) => `  • ${i}`),
    ``,
    `💡 *Recomendación:*`,
    `_${result.consolidated.recommendation}_`,
  ].join('\n');

  await sendMessage(chatId, summary);

  // Mensaje 2: Detalle por URL (si hay más de 1)
  if (result.individual.length > 1) {
    await new Promise((r) => setTimeout(r, 800));

    const details = result.individual.map((item, i) => {
      if (item.error) return `*${i + 1}.* ❌ ${item.url}\n   _Error: ${item.error}_`;
      const em = item.sentiment === 'BULLISH' ? '🟢' : item.sentiment === 'BEARISH' ? '🔴' : '🟡';
      return [
        `*${i + 1}.* ${em} ${item.title}`,
        `   Tipo: ${item.dataType} | Impacto: ${item.impactLevel} | ${pct(item.confidence)}`,
        `   _${item.priceDirectionReasoning}_`,
      ].join('\n');
    });

    await sendMessage(chatId,
      `📋 *Detalle por fuente:*\n\n${details.join('\n\n')}`
    );
  }
}

interface StatusData {
  uptime: number; memory: NodeJS.MemoryUsage; activeRequests: number; timestamp: number;
}

async function sendOrchestratorStatus(chatId: number, data: StatusData): Promise<void> {
  const h = Math.floor(data.uptime / 3600);
  const m = Math.floor((data.uptime % 3600) / 60);
  const memMB = Math.round(data.memory.heapUsed / 1024 / 1024);

  await sendMessage(chatId, [
    `🦞 *Estado de OpenClaw*`,
    ``,
    `🟢 Activo`,
    `⏱ Uptime: ${h}h ${m}m`,
    `💾 Memoria: ${memMB} MB`,
    `🔄 Requests activos: ${data.activeRequests}`,
    `🕐 ${new Date(data.timestamp).toLocaleTimeString('es-AR', { timeZone: 'America/Argentina/Buenos_Aires' })}`,
  ].join('\n'));
}

interface AgentListData { agents: Array<{ id: string; status: string; description: string }> }

async function sendAgentList(chatId: number, data: AgentListData): Promise<void> {
  const lines = data.agents.map((a) =>
    `${a.status === 'running' ? '🟢' : '🔴'} *${a.id}*\n   _${a.description}_`
  );
  await sendMessage(chatId, `🦞 *Agentes de OpenClaw*\n\n${lines.join('\n\n')}`);
}

// ─── Handlers de comandos del dueño ───────────────────────────────────────

export async function handleOwnerMessage(chatId: number, text: string): Promise<void> {
  const urls = extractUrls(text);

  if (urls.length > 0) {
    logger.info('Owner sent URLs for analysis', { count: urls.length });
    await sendMessage(chatId, [
      `🦞 *OpenClaw recibió ${urls.length} fuente(s)*`,
      ``,
      ...urls.map((u, i) => `${i + 1}. \`${truncate(u, 60)}\``),
      ``,
      `_Analizando con Gemini... esto puede tomar 15-30 segundos._`,
    ].join('\n'));

    await sendOwnerCommand({
      chatId,
      type: 'ANALYZE_LINKS',
      payload: { urls },
    });
    return;
  }

  // Texto libre sin URLs → enviamos como contexto a Gemini vía OpenClaw
  if (text.length > 10 && !text.startsWith('/')) {
    await sendMessage(chatId, `🦞 _Mandaste texto sin URLs. Si querés analizar, incluí los links directamente en el mensaje._`);
  }
}

export async function handleOwnerCommand(chatId: number, command: string): Promise<void> {
  const cmd = command.split(' ')[0].toLowerCase();
  const args = command.split(' ').slice(1);

  switch (cmd) {
    case '/agentes': {
      await sendOwnerCommand({ chatId, type: 'LIST_AGENTS', payload: {} });
      break;
    }
    case '/openclaw': {
      await sendOwnerCommand({ chatId, type: 'STATUS', payload: {} });
      break;
    }
    case '/predecir': {
      const pair = args[0]?.toUpperCase().replace('-', '/') ?? 'USD/ARS';
      await sendOwnerCommand({ chatId, type: 'FORCE_PREDICT', payload: { pair } });
      await sendMessage(chatId, `🦞 _Predicción forzada para ${pair} enviada a OpenClaw_`);
      break;
    }
    case '/analizar': {
      const urls = args.filter((a) => a.startsWith('http'));
      if (urls.length === 0) {
        await sendMessage(chatId, '❌ Usá: `/analizar https://url1.com https://url2.com`');
        return;
      }
      await handleOwnerMessage(chatId, urls.join(' '));
      break;
    }
  }
}

function extractUrls(text: string): string[] {
  const urlRegex = /https?:\/\/[^\s<>"{}|\\^`[\]]+/g;
  const matches = text.match(urlRegex) ?? [];
  return [...new Set(matches)].slice(0, 10); // máximo 10 URLs
}

function truncate(str: string, len: number): string {
  return str.length > len ? str.slice(0, len) + '...' : str;
}

// Re-export types for bot index
export type { OwnerCommand, OwnerResponse };
