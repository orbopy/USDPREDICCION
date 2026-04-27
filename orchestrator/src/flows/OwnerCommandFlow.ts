import { subscribe, publish } from '../../shared/utils/redis';
import { LinkAnalyzerAgent } from '../agents/LinkAnalyzerAgent';
import { createLogger } from '../../shared/utils/logger';

const logger = createLogger('owner-command-flow');

// Canales Redis de comunicación bot ↔ orquestador
export const OWNER_CMD_CHANNEL  = 'owner:command';
export const OWNER_RESP_CHANNEL = 'owner:response';

export interface OwnerCommand {
  requestId: string;
  chatId: number;
  type: 'ANALYZE_LINKS' | 'FORCE_PREDICT' | 'STATUS' | 'LIST_AGENTS';
  payload: {
    urls?: string[];
    pair?: string;
    message?: string;
  };
  sentAt: number;
}

export interface OwnerResponse {
  requestId: string;
  chatId: number;
  type: OwnerCommand['type'];
  status: 'OK' | 'ERROR' | 'PROCESSING';
  data?: unknown;
  error?: string;
  processedAt: number;
}

const linkAnalyzer = new LinkAnalyzerAgent();

export class OwnerCommandFlow {
  private activeRequests = new Set<string>();

  async start(): Promise<void> {
    logger.info('OwnerCommandFlow started — listening on Redis');

    await subscribe(OWNER_CMD_CHANNEL, async (payload: unknown) => {
      const cmd = payload as OwnerCommand;
      if (!cmd?.requestId || !cmd?.chatId) return;

      // Evitar duplicados
      if (this.activeRequests.has(cmd.requestId)) return;
      this.activeRequests.add(cmd.requestId);

      logger.info('Owner command received', { type: cmd.type, chatId: cmd.chatId, requestId: cmd.requestId });

      // ACK inmediato al bot
      await this.respond(cmd, 'PROCESSING', { message: 'Procesando...' });

      try {
        await this.dispatch(cmd);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        logger.error('Owner command failed', { requestId: cmd.requestId, error: message });
        await this.respond(cmd, 'ERROR', undefined, message);
      } finally {
        this.activeRequests.delete(cmd.requestId);
      }
    });
  }

  private async dispatch(cmd: OwnerCommand): Promise<void> {
    switch (cmd.type) {
      case 'ANALYZE_LINKS': {
        const urls = cmd.payload.urls ?? [];
        if (urls.length === 0) {
          await this.respond(cmd, 'ERROR', undefined, 'No se recibieron URLs');
          return;
        }
        const result = await linkAnalyzer.analyzeUrls(urls);

        // Publicar también al canal de contexto LLM para que el swarm lo use
        await publish('market:llm:context', {
          sentiment: result.consolidated.overallSentiment,
          impactLevel: result.consolidated.confidence > 0.7 ? 'HIGH' : result.consolidated.confidence > 0.4 ? 'MEDIUM' : 'LOW',
          events: result.individual.map((r) => ({
            type: 'ECONOMIC',
            description: r.title,
            affectedPairs: r.affectedPairs,
            expectedImpact: r.sentiment === 'BULLISH' ? 'UP' : r.sentiment === 'BEARISH' ? 'DOWN' : 'NEUTRAL',
            severity: r.confidence,
          })),
          reasoning: result.consolidated.recommendation,
          confidence: result.consolidated.confidence,
        });

        await this.respond(cmd, 'OK', result);
        break;
      }

      case 'FORCE_PREDICT': {
        const pair = cmd.payload.pair ?? 'USD/ARS';
        await publish('owner:force_predict', { pair, requestedAt: Date.now() });
        await this.respond(cmd, 'OK', { message: `Predicción forzada para ${pair}. Resultado en breve.` });
        break;
      }

      case 'STATUS': {
        await this.respond(cmd, 'OK', {
          uptime: process.uptime(),
          memory: process.memoryUsage(),
          activeRequests: this.activeRequests.size,
          timestamp: Date.now(),
        });
        break;
      }

      case 'LIST_AGENTS': {
        await this.respond(cmd, 'OK', {
          agents: [
            { id: 'data-ingestion',  status: 'running', description: 'Scrapers ARS/BRL/PYG' },
            { id: 'llm-interpreter', status: 'running', description: 'Gemini news analyzer' },
            { id: 'ml-engine',       status: 'running', description: 'LSTM + XGBoost' },
            { id: 'swarm-engine',    status: 'running', description: 'MiroFish PSO consensus' },
            { id: 'link-analyzer',   status: 'running', description: 'Owner link analyzer' },
          ],
        });
        break;
      }
    }
  }

  private async respond(
    cmd: OwnerCommand,
    status: OwnerResponse['status'],
    data?: unknown,
    error?: string,
  ): Promise<void> {
    const response: OwnerResponse = {
      requestId: cmd.requestId,
      chatId: cmd.chatId,
      type: cmd.type,
      status,
      data,
      error,
      processedAt: Date.now(),
    };
    await publish(OWNER_RESP_CHANNEL, response);
  }
}
