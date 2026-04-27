import { WebSocketServer, WebSocket } from 'ws';
import { createClient } from 'redis';
import { createLogger } from '../../shared/utils/logger';
import type { Server } from 'http';

const logger = createLogger('websocket-server');

const SUBSCRIBED_CHANNELS = [
  'market:swarm:decision',
  'market:alerts',
  'market:snapshot',
  'market:llm:context',
  'market:ml:prediction',
];

export class RealtimeServer {
  private wss: WebSocketServer;
  private clients = new Set<WebSocket>();

  constructor(server: Server) {
    this.wss = new WebSocketServer({ server, path: '/ws' });
    this.wss.on('connection', (ws) => this.handleConnection(ws));
    logger.info('WebSocket server initialized on /ws');
  }

  async startRedisRelay(): Promise<void> {
    const sub = createClient({ url: process.env.REDIS_URL ?? 'redis://localhost:6379' });
    await sub.connect();

    for (const channel of SUBSCRIBED_CHANNELS) {
      await sub.subscribe(channel, (message) => {
        try {
          const payload = JSON.parse(message);
          this.broadcast({ channel, payload, timestamp: Date.now() });
        } catch {
          logger.warn(`Failed to parse Redis message on ${channel}`);
        }
      });
    }

    logger.info('Redis → WebSocket relay active', { channels: SUBSCRIBED_CHANNELS });
  }

  private handleConnection(ws: WebSocket): void {
    this.clients.add(ws);
    logger.info('Client connected', { total: this.clients.size });

    ws.send(JSON.stringify({
      type: 'CONNECTED',
      message: 'USDPREDICCION realtime feed connected',
      channels: SUBSCRIBED_CHANNELS,
      timestamp: Date.now(),
    }));

    ws.on('message', (data) => {
      try {
        const msg = JSON.parse(data.toString()) as { type: string };
        if (msg.type === 'PING') ws.send(JSON.stringify({ type: 'PONG', timestamp: Date.now() }));
      } catch {
        // ignore malformed messages
      }
    });

    ws.on('close', () => {
      this.clients.delete(ws);
      logger.debug('Client disconnected', { total: this.clients.size });
    });

    ws.on('error', (err) => logger.warn('WebSocket error', err));
  }

  private broadcast(data: unknown): void {
    const message = JSON.stringify(data);
    for (const client of this.clients) {
      if (client.readyState === WebSocket.OPEN) {
        client.send(message);
      }
    }
  }

  get connectedClients(): number {
    return this.clients.size;
  }
}
