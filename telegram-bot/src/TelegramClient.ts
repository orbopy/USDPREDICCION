import { createLogger } from '../../shared/utils/logger';

const logger = createLogger('telegram-client');
const BASE_URL = `https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}`;

export interface TelegramUpdate {
  update_id: number;
  message?: {
    message_id: number;
    from: { id: number; username?: string; first_name: string };
    chat: { id: number; type: string };
    text?: string;
    date: number;
  };
}

export interface SendOptions {
  parse_mode?: 'Markdown' | 'HTML';
  disable_notification?: boolean;
  reply_markup?: unknown;
}

async function apiCall<T>(method: string, body: Record<string, unknown>): Promise<T> {
  const res = await fetch(`${BASE_URL}/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(15_000),
  });

  const data = await res.json() as { ok: boolean; result: T; description?: string };
  if (!data.ok) throw new Error(`Telegram API error: ${data.description}`);
  return data.result;
}

export async function sendMessage(
  chatId: number,
  text: string,
  options: SendOptions = {},
): Promise<void> {
  try {
    await apiCall('sendMessage', {
      chat_id: chatId,
      text,
      parse_mode: 'Markdown',
      ...options,
    });
  } catch (err) {
    logger.warn(`Failed to send message to ${chatId}`, err);
  }
}

export async function sendToMany(chatIds: number[], text: string, options?: SendOptions): Promise<void> {
  await Promise.allSettled(chatIds.map((id) => sendMessage(id, text, options)));
}

export async function getUpdates(offset: number): Promise<TelegramUpdate[]> {
  const result = await apiCall<TelegramUpdate[]>('getUpdates', {
    offset,
    timeout: 30,
    allowed_updates: ['message'],
  });
  return result ?? [];
}

export async function setMyCommands(): Promise<void> {
  await apiCall('setMyCommands', {
    commands: [
      { command: 'start',      description: '🚀 Suscribirse a alertas en tiempo real' },
      { command: 'stop',       description: '🔕 Cancelar suscripción' },
      { command: 'prediccion', description: '📊 Ver última predicción' },
      { command: 'precio',     description: '💵 Ver tasas actuales' },
      { command: 'informe',    description: '📈 Informe del día' },
      { command: 'status',     description: '⚙️ Estado del sistema' },
      { command: 'ayuda',      description: '❓ Lista de comandos' },
    ],
  });
  logger.info('Bot commands registered');
}
