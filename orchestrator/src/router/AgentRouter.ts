import { createLogger } from '../../shared/utils/logger';
import type { AgentConfig } from '../config/agents.config';

const logger = createLogger('agent-router');

type AgentHandler = () => Promise<unknown>;

interface RegisteredAgent {
  config: AgentConfig;
  handler: AgentHandler;
  lastRunAt: number;
  consecutiveErrors: number;
}

export class AgentRouter {
  private agents = new Map<string, RegisteredAgent>();
  private running = false;
  private tickHandle: NodeJS.Timeout | null = null;

  register(config: AgentConfig, handler: AgentHandler): void {
    this.agents.set(config.id, { config, handler, lastRunAt: 0, consecutiveErrors: 0 });
    logger.info(`Agent registered: ${config.name}`, { id: config.id, enabled: config.enabled });
  }

  async start(): Promise<void> {
    if (this.running) return;
    this.running = true;
    logger.info('AgentRouter started', { agentCount: this.agents.size });

    // Tick every 30s — check which agents are due
    this.tickHandle = setInterval(() => this.tick(), 30_000);
    await this.tick();
  }

  stop(): void {
    if (this.tickHandle) clearInterval(this.tickHandle);
    this.running = false;
    logger.info('AgentRouter stopped');
  }

  private async tick(): Promise<void> {
    const now = Date.now();
    const promises: Promise<void>[] = [];

    for (const [id, agent] of this.agents) {
      if (!agent.config.enabled) continue;
      if (agent.consecutiveErrors >= 5) {
        logger.warn(`Agent ${id} suspended after 5 consecutive errors`);
        continue;
      }

      if (this.isDue(agent, now)) {
        promises.push(this.runAgent(id, agent, now));
      }
    }

    await Promise.allSettled(promises);
  }

  private isDue(agent: RegisteredAgent, now: number): boolean {
    if (!agent.config.schedule) return false;
    const intervalMs = this.parseSchedule(agent.config.schedule);
    return now - agent.lastRunAt >= intervalMs;
  }

  private async runAgent(id: string, agent: RegisteredAgent, now: number): Promise<void> {
    agent.lastRunAt = now;
    try {
      const result = await Promise.race([
        agent.handler(),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error('Agent timeout')), agent.config.timeoutMs)
        ),
      ]);
      agent.consecutiveErrors = 0;
      logger.debug(`Agent ${id} completed`, { result });
    } catch (err) {
      agent.consecutiveErrors++;
      logger.error(`Agent ${id} failed (${agent.consecutiveErrors}/5)`, err);
    }
  }

  private parseSchedule(schedule: string): number {
    // Simplified: only handles "*/N * * * *" → N minutes
    const match = schedule.match(/^\*\/(\d+)/);
    if (match) return parseInt(match[1]) * 60 * 1000;
    return 60 * 1000;
  }
}
