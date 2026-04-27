import { createParticle, directionFromScore, ParticleState } from './Particle';
import { createLogger } from '../../shared/utils/logger';
import type { SwarmConsensus, AgentVote, SignalDirection } from '../../shared/types/MarketData';

const logger = createLogger('swarm-engine');

export interface SwarmConfig {
  particles: number;
  maxIterations: number;
  convergenceThreshold: number;
  inertiaDecay: number;
}

const DEFAULT_CONFIG: SwarmConfig = {
  particles: 12,
  maxIterations: 50,
  convergenceThreshold: 0.02,
  inertiaDecay: 0.99,
};

export class SwarmEngine {
  private config: SwarmConfig;

  constructor(config: Partial<SwarmConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * PSO-inspired swarm optimization for market direction consensus.
   * Agents explore the solution space and converge to a collective decision.
   */
  optimize(agentInputs: Array<{ id: string; type: string; score: number; confidence: number; weight: number }>): SwarmConsensus {
    if (agentInputs.length === 0) {
      return this.emptyConsensus();
    }

    const particles: ParticleState[] = agentInputs.map((a) =>
      createParticle(a.id, a.type)
    );

    // Initialize particles at agent-reported positions
    for (let i = 0; i < particles.length; i++) {
      particles[i].position.bullishScore = agentInputs[i].score;
      particles[i].position.confidence = agentInputs[i].confidence;
    }

    let globalBest: ParticleState['position'] = { bullishScore: 0, confidence: 0, velocity: 0 };
    let globalBestFitness = -Infinity;
    let iteration = 0;
    let prevCentroid = Infinity;

    while (iteration < this.config.maxIterations) {
      // Evaluate fitness for each particle
      for (let i = 0; i < particles.length; i++) {
        const p = particles[i];
        const agentWeight = agentInputs[i].weight;
        const fitness = this.fitness(p.position, agentWeight);

        if (fitness > p.bestFitness) {
          p.bestFitness = fitness;
          p.bestPosition = { ...p.position };
        }

        if (fitness > globalBestFitness) {
          globalBestFitness = fitness;
          globalBest = { ...p.position };
        }
      }

      // Update velocities and positions
      for (const p of particles) {
        const r1 = Math.random();
        const r2 = Math.random();

        p.position.velocity =
          p.inertia * p.position.velocity +
          p.cognitiveWeight * r1 * (p.bestPosition.bullishScore - p.position.bullishScore) +
          p.socialWeight * r2 * (globalBest.bullishScore - p.position.bullishScore);

        p.position.bullishScore = Math.max(-1, Math.min(1,
          p.position.bullishScore + p.position.velocity
        ));

        p.inertia *= this.config.inertiaDecay;
      }

      // Check convergence
      const centroid = particles.reduce((s, p) => s + p.position.bullishScore, 0) / particles.length;
      if (Math.abs(centroid - prevCentroid) < this.config.convergenceThreshold) {
        logger.debug(`Swarm converged at iteration ${iteration}`, { centroid });
        break;
      }
      prevCentroid = centroid;
      iteration++;
    }

    return this.buildConsensus(particles, agentInputs, globalBest, globalBestFitness, iteration);
  }

  private fitness(pos: ParticleState['position'], agentWeight: number): number {
    return Math.abs(pos.bullishScore) * pos.confidence * agentWeight;
  }

  private buildConsensus(
    particles: ParticleState[],
    inputs: Array<{ id: string; type: string; score: number; confidence: number; weight: number }>,
    globalBest: ParticleState['position'],
    _fitness: number,
    iterations: number,
  ): SwarmConsensus {
    const direction = directionFromScore(globalBest.bullishScore);

    const agentVotes: AgentVote[] = particles.map((p, i) => ({
      agentId: p.id,
      agentType: p.agentType,
      direction: directionFromScore(p.position.bullishScore) as SignalDirection,
      weight: inputs[i].weight,
      confidence: p.position.confidence,
    }));

    const agreeing = agentVotes.filter((v) => v.direction === direction).length;
    const convergenceScore = agreeing / agentVotes.length;

    return {
      direction,
      confidence: Math.min(0.95, globalBest.confidence * convergenceScore),
      agentVotes,
      convergenceScore,
      iterationsRun: iterations,
    };
  }

  private emptyConsensus(): SwarmConsensus {
    return {
      direction: 'NEUTRAL',
      confidence: 0,
      agentVotes: [],
      convergenceScore: 0,
      iterationsRun: 0,
    };
  }
}
