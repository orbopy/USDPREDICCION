import type { PredictionResult, LLMContext, SwarmConsensus } from '../../shared/types/MarketData';

const DIRECTION_EMOJI = { UP: '🟢', DOWN: '🔴', NEUTRAL: '🟡' } as const;
const CONFIDENCE_BAR_LEN = 10;

function confidenceBar(confidence: number): string {
  const filled = Math.round(confidence * CONFIDENCE_BAR_LEN);
  return '█'.repeat(filled) + '░'.repeat(CONFIDENCE_BAR_LEN - filled);
}

function pct(n: number): string {
  return `${(n * 100).toFixed(1)}%`;
}

export function formatPrediction(p: PredictionResult): string {
  const emoji = DIRECTION_EMOJI[p.direction] ?? '🟡';
  const lines: string[] = [
    `${emoji} *SEÑAL ${p.pair}*`,
    ``,
    `📊 Dirección: *${p.direction}*`,
    `🎯 Confianza: ${pct(p.confidence)} ${confidenceBar(p.confidence)}`,
    `⏱ Horizonte: ${p.horizonMinutes} minutos`,
    `📈 Volatilidad est.: ${pct(p.volatilityEstimate)}`,
  ];

  if (p.swarmConsensus) {
    const sc = p.swarmConsensus;
    lines.push(``, `🐟 *Swarm (MiroFish)*`);
    lines.push(`  Consenso: ${DIRECTION_EMOJI[sc.direction]} ${sc.direction}`);
    lines.push(`  Convergencia: ${pct(sc.convergenceScore)}`);
    lines.push(`  Votos: ${sc.agentVotes.length} agentes`);
  }

  if (p.reasoning) {
    lines.push(``, `💬 _${p.reasoning}_`);
  }

  lines.push(``, `🕐 ${new Date(p.timestamp).toLocaleTimeString('es-AR', { timeZone: 'America/Argentina/Buenos_Aires' })} (ARG)`);

  return lines.join('\n');
}

export function formatAlert(alert: {
  pair: string;
  direction: string;
  confidence: number;
  horizonMinutes: number;
  reasoning: string;
  emoji: string;
}): string {
  const bar = confidenceBar(alert.confidence);
  return [
    `${alert.emoji} *ALERTA — ${alert.pair}*`,
    ``,
    `Dirección: *${alert.direction}*`,
    `Confianza: *${pct(alert.confidence)}* ${bar}`,
    `Horizonte: ${alert.horizonMinutes} min`,
    ``,
    `_${alert.reasoning}_`,
  ].join('\n');
}

export function formatLLMContext(ctx: LLMContext): string {
  const sentEmoji = ctx.sentiment === 'BULLISH' ? '🟢' : ctx.sentiment === 'BEARISH' ? '🔴' : '🟡';
  const impactEmoji = ctx.impactLevel === 'HIGH' ? '🔥' : ctx.impactLevel === 'MEDIUM' ? '⚠️' : 'ℹ️';

  const lines: string[] = [
    `🤖 *Análisis IA (Gemini)*`,
    ``,
    `${sentEmoji} Sentimiento: *${ctx.sentiment}*`,
    `${impactEmoji} Impacto: *${ctx.impactLevel}*`,
    `🎯 Confianza: ${pct(ctx.confidence)}`,
  ];

  if (ctx.events.length > 0) {
    lines.push(``, `📰 *Eventos detectados:*`);
    for (const ev of ctx.events.slice(0, 3)) {
      const evEmoji = ev.expectedImpact === 'UP' ? '🟢' : ev.expectedImpact === 'DOWN' ? '🔴' : '🟡';
      lines.push(`  ${evEmoji} [${ev.type}] ${ev.description}`);
    }
  }

  if (ctx.reasoning) {
    lines.push(``, `💬 _${ctx.reasoning}_`);
  }

  return lines.join('\n');
}

export function formatDailyReport(data: {
  predictions: PredictionResult[];
  topPair: string;
  upCount: number;
  downCount: number;
  neutralCount: number;
  avgConfidence: number;
}): string {
  const total = data.upCount + data.downCount + data.neutralCount;
  const bar = confidenceBar(data.avgConfidence);

  return [
    `📊 *INFORME DIARIO — USDPREDICCION*`,
    ``,
    `📅 ${new Date().toLocaleDateString('es-AR', { timeZone: 'America/Argentina/Buenos_Aires', weekday: 'long', day: '2-digit', month: 'long' })}`,
    ``,
    `📈 *Señales generadas:* ${total}`,
    `  🟢 Alcistas (UP):  ${data.upCount}`,
    `  🔴 Bajistas (DOWN): ${data.downCount}`,
    `  🟡 Neutral:        ${data.neutralCount}`,
    ``,
    `🏆 Par más activo: *${data.topPair}*`,
    `🎯 Confianza promedio: ${pct(data.avgConfidence)} ${bar}`,
    ``,
    `_Sistema USDPREDICCION — OpenClaw + MiroFish + Gemini_`,
  ].join('\n');
}

export function formatStatus(data: {
  uptime: number;
  subscriberCount: number;
  lastPrediction?: PredictionResult;
  lastSignalAgo?: number;
}): string {
  const uptimeH = Math.floor(data.uptime / 3600);
  const uptimeM = Math.floor((data.uptime % 3600) / 60);

  const lines: string[] = [
    `⚙️ *Estado del Sistema*`,
    ``,
    `🟢 Online`,
    `⏱ Uptime: ${uptimeH}h ${uptimeM}m`,
    `👥 Suscriptores: ${data.subscriberCount}`,
  ];

  if (data.lastPrediction) {
    const dir = data.lastPrediction.direction;
    lines.push(``, `📊 Última señal: ${DIRECTION_EMOJI[dir]} ${dir} (${data.lastPrediction.pair})`);
    if (data.lastSignalAgo !== undefined) {
      const mins = Math.floor(data.lastSignalAgo / 60000);
      lines.push(`🕐 Hace ${mins} minutos`);
    }
  }

  lines.push(``, `_@usdprediccion\\_bot_`);
  return lines.join('\n');
}
