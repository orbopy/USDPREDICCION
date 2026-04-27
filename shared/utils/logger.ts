export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const LEVELS: Record<LogLevel, number> = { debug: 0, info: 1, warn: 2, error: 3 };
const currentLevel = (process.env.LOG_LEVEL as LogLevel) ?? 'info';

function log(level: LogLevel, service: string, message: string, data?: unknown) {
  if (LEVELS[level] < LEVELS[currentLevel]) return;

  const entry = {
    ts: new Date().toISOString(),
    level,
    service,
    message,
    ...(data !== undefined && { data }),
  };

  const line = JSON.stringify(entry);
  if (level === 'error') process.stderr.write(line + '\n');
  else process.stdout.write(line + '\n');
}

export function createLogger(service: string) {
  return {
    debug: (msg: string, data?: unknown) => log('debug', service, msg, data),
    info: (msg: string, data?: unknown) => log('info', service, msg, data),
    warn: (msg: string, data?: unknown) => log('warn', service, msg, data),
    error: (msg: string, data?: unknown) => log('error', service, msg, data),
  };
}
