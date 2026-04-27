export interface AgentConfig {
  id: string;
  name: string;
  enabled: boolean;
  retries: number;
  timeoutMs: number;
  schedule?: string;   // cron-like, ej: "*/1 * * * *"
}

export const AGENTS_CONFIG: Record<string, AgentConfig> = {
  dataCollector: {
    id: 'data-collector',
    name: 'Data Collector Agent',
    enabled: true,
    retries: 3,
    timeoutMs: 15_000,
    schedule: '*/1 * * * *',
  },
  newsAnalyzer: {
    id: 'news-analyzer',
    name: 'News Analyzer Agent',
    enabled: true,
    retries: 2,
    timeoutMs: 30_000,
    schedule: '*/5 * * * *',
  },
  mlPredictor: {
    id: 'ml-predictor',
    name: 'ML Prediction Agent',
    enabled: true,
    retries: 2,
    timeoutMs: 20_000,
    schedule: '*/2 * * * *',
  },
  swarmDecision: {
    id: 'swarm-decision',
    name: 'Swarm Decision Agent',
    enabled: true,
    retries: 1,
    timeoutMs: 10_000,
  },
  alertDispatcher: {
    id: 'alert-dispatcher',
    name: 'Alert Dispatcher Agent',
    enabled: true,
    retries: 2,
    timeoutMs: 5_000,
  },
};

export const FLOW_CONFIG = {
  pairs: (process.env.TRADING_PAIRS ?? 'USD/ARS,USD/BRL,BRL/PYG').split(','),
  horizonMinutes: parseInt(process.env.HORIZON_MINUTES ?? '15'),
  confidenceThreshold: parseFloat(process.env.CONFIDENCE_THRESHOLD ?? '0.65'),
  alertOnlyHighConfidence: process.env.ALERT_ONLY_HIGH === 'true',
};
