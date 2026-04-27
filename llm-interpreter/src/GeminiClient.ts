import { createLogger } from '../shared/utils/logger';
import type { LLMContext } from '../shared/types/MarketData';

const logger = createLogger('gemini-client');

interface OpenRouterResponse {
  choices: Array<{ message: { content: string } }>;
}

const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';

export class GeminiClient {
  private readonly apiKey = process.env.OPENROUTER_API_KEY ?? '';
  private readonly model = process.env.LLM_MODEL ?? 'google/gemini-2.0-flash-exp:free';
  private readonly maxRetries = 3;

  async analyze(prompt: string): Promise<LLMContext | null> {
    for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
      try {
        return await this.callAPI(prompt);
      } catch (err) {
        logger.warn(`LLM attempt ${attempt} failed`, err);
        if (attempt < this.maxRetries) await this.sleep(attempt * 1000);
      }
    }
    logger.error('All LLM attempts exhausted');
    return null;
  }

  private async callAPI(prompt: string): Promise<LLMContext> {
    if (!this.apiKey) throw new Error('OPENROUTER_API_KEY not configured');

    const res = await fetch(OPENROUTER_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://frontier-market-predictor.local',
        'X-Title': 'Frontier Market Predictor',
      },
      body: JSON.stringify({
        model: this.model,
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.1,
        max_tokens: 1024,
        response_format: { type: 'json_object' },
      }),
      signal: AbortSignal.timeout(30_000),
    });

    if (!res.ok) {
      const body = await res.text();
      throw new Error(`OpenRouter error ${res.status}: ${body}`);
    }

    const data = await res.json() as OpenRouterResponse;
    const raw = data.choices[0]?.message?.content;
    if (!raw) throw new Error('Empty LLM response');

    const parsed = JSON.parse(raw) as LLMContext;
    logger.info('LLM analysis complete', { sentiment: parsed.sentiment, impact: parsed.impactLevel });
    return parsed;
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((r) => setTimeout(r, ms));
  }
}
