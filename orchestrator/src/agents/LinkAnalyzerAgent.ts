import { createLogger } from '../../shared/utils/logger';

const logger = createLogger('link-analyzer-agent');
const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';
const MODEL = process.env.LLM_MODEL ?? 'google/gemini-2.0-flash-exp:free';

export interface LinkAnalysisResult {
  url: string;
  title: string;
  sentiment: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
  impactLevel: 'HIGH' | 'MEDIUM' | 'LOW';
  confidence: number;
  affectedPairs: string[];
  keyPoints: string[];
  priceDirectionReasoning: string;
  dataType: 'NEWS' | 'BANK_REPORT' | 'GOVERNMENT' | 'API_DATA' | 'ANALYSIS' | 'OTHER';
  error?: string;
}

export interface BatchAnalysisResult {
  urls: string[];
  individual: LinkAnalysisResult[];
  consolidated: {
    overallSentiment: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
    confidence: number;
    topInsights: string[];
    recommendation: string;
    affectedPairs: string[];
  };
  analyzedAt: number;
}

async function fetchUrlContent(url: string): Promise<string> {
  const res = await fetch(url, {
    signal: AbortSignal.timeout(15_000),
    headers: {
      'User-Agent': 'Mozilla/5.0 (compatible; USDPrediccion/1.0)',
      'Accept': 'text/html,application/json,text/plain,*/*',
    },
  });

  if (!res.ok) throw new Error(`HTTP ${res.status}`);

  const contentType = res.headers.get('content-type') ?? '';
  const text = await res.text();

  // JSON → convertir a texto legible
  if (contentType.includes('application/json')) {
    try {
      const parsed = JSON.parse(text);
      return JSON.stringify(parsed, null, 2).slice(0, 8000);
    } catch {
      return text.slice(0, 8000);
    }
  }

  // HTML → extraer solo texto (remover tags)
  return text
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim()
    .slice(0, 8000);
}

async function callGemini(prompt: string): Promise<string> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) throw new Error('OPENROUTER_API_KEY not set');

  const res = await fetch(OPENROUTER_URL, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': 'https://usdprediccion.local',
      'X-Title': 'USDPREDICCION Owner Analysis',
    },
    body: JSON.stringify({
      model: MODEL,
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.1,
      max_tokens: 1500,
      response_format: { type: 'json_object' },
    }),
    signal: AbortSignal.timeout(45_000),
  });

  if (!res.ok) throw new Error(`OpenRouter ${res.status}: ${await res.text()}`);
  const data = await res.json() as { choices: Array<{ message: { content: string } }> };
  return data.choices[0]?.message?.content ?? '{}';
}

const SINGLE_ANALYSIS_PROMPT = (url: string, content: string) => `
Sos un analista experto en mercados cambiarios de frontera (Argentina, Paraguay, Brasil).
Analizá el siguiente contenido extraído de la URL: ${url}

CONTENIDO:
${content}

Respondé ÚNICAMENTE con JSON válido con esta estructura exacta:
{
  "title": "título o descripción breve de la fuente",
  "dataType": "NEWS" | "BANK_REPORT" | "GOVERNMENT" | "API_DATA" | "ANALYSIS" | "OTHER",
  "sentiment": "BULLISH" | "BEARISH" | "NEUTRAL",
  "impactLevel": "HIGH" | "MEDIUM" | "LOW",
  "confidence": 0.0 a 1.0,
  "affectedPairs": ["USD/ARS", "USD/BRL", "BRL/PYG"],
  "keyPoints": ["punto 1", "punto 2", "punto 3"],
  "priceDirectionReasoning": "explicación de por qué sube o baja el dólar/moneda en 2 oraciones"
}

REGLAS:
- BULLISH = el dólar o moneda extranjera sube respecto a ARS/moneda local
- BEARISH = el dólar baja
- Solo mencioná pares que realmente se vean afectados
- Si el contenido no tiene info financiera relevante, impactLevel: "LOW", confidence < 0.3
`;

const CONSOLIDATION_PROMPT = (analyses: LinkAnalysisResult[]) => `
Sos un analista senior de mercados cambiarios. Analizaste las siguientes fuentes:

${JSON.stringify(analyses.map(a => ({
  url: a.url,
  title: a.title,
  sentiment: a.sentiment,
  impact: a.impactLevel,
  keyPoints: a.keyPoints,
  reasoning: a.priceDirectionReasoning,
})), null, 2)}

Generá una síntesis consolidada en JSON:
{
  "overallSentiment": "BULLISH" | "BEARISH" | "NEUTRAL",
  "confidence": 0.0 a 1.0,
  "topInsights": ["insight 1", "insight 2", "insight 3"],
  "affectedPairs": ["USD/ARS", ...],
  "recommendation": "acción concreta recomendada para operador de cambio en 1-2 oraciones"
}

Pesá más las fuentes con impacto HIGH. Si hay contradicción entre fuentes, bajá la confianza.
`;

export class LinkAnalyzerAgent {
  readonly id = 'link-analyzer';

  async analyzeUrls(urls: string[]): Promise<BatchAnalysisResult> {
    logger.info('Analyzing URLs', { count: urls.length, urls });

    // Analizar cada URL en paralelo
    const individual = await Promise.all(
      urls.map((url) => this.analyzeSingle(url))
    );

    // Consolidar resultados válidos
    const valid = individual.filter((r) => !r.error);
    let consolidated: BatchAnalysisResult['consolidated'];

    if (valid.length === 0) {
      consolidated = {
        overallSentiment: 'NEUTRAL',
        confidence: 0,
        topInsights: ['No se pudieron analizar las fuentes'],
        recommendation: 'Sin datos suficientes para recomendar',
        affectedPairs: [],
      };
    } else if (valid.length === 1) {
      consolidated = {
        overallSentiment: valid[0].sentiment,
        confidence: valid[0].confidence,
        topInsights: valid[0].keyPoints,
        recommendation: valid[0].priceDirectionReasoning,
        affectedPairs: valid[0].affectedPairs,
      };
    } else {
      try {
        const raw = await callGemini(CONSOLIDATION_PROMPT(valid));
        consolidated = JSON.parse(raw) as BatchAnalysisResult['consolidated'];
      } catch (err) {
        logger.warn('Consolidation failed, using simple average', err);
        consolidated = this.simpleConsolidate(valid);
      }
    }

    return {
      urls,
      individual,
      consolidated,
      analyzedAt: Date.now(),
    };
  }

  private async analyzeSingle(url: string): Promise<LinkAnalysisResult> {
    try {
      logger.debug('Fetching URL', { url });
      const content = await fetchUrlContent(url);
      const raw = await callGemini(SINGLE_ANALYSIS_PROMPT(url, content));
      const parsed = JSON.parse(raw) as Omit<LinkAnalysisResult, 'url'>;
      return { url, ...parsed };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      logger.warn(`Failed to analyze URL: ${url}`, message);
      return {
        url,
        title: 'Error al analizar',
        sentiment: 'NEUTRAL',
        impactLevel: 'LOW',
        confidence: 0,
        affectedPairs: [],
        keyPoints: [],
        priceDirectionReasoning: '',
        dataType: 'OTHER',
        error: message,
      };
    }
  }

  private simpleConsolidate(results: LinkAnalysisResult[]): BatchAnalysisResult['consolidated'] {
    const scores = results.map((r) =>
      (r.sentiment === 'BULLISH' ? 1 : r.sentiment === 'BEARISH' ? -1 : 0) * r.confidence
    );
    const avg = scores.reduce((a, b) => a + b, 0) / scores.length;
    const sentiment = avg > 0.1 ? 'BULLISH' : avg < -0.1 ? 'BEARISH' : 'NEUTRAL';
    const pairs = [...new Set(results.flatMap((r) => r.affectedPairs))];
    const insights = results.flatMap((r) => r.keyPoints).slice(0, 4);

    return {
      overallSentiment: sentiment,
      confidence: Math.min(0.9, Math.abs(avg)),
      topInsights: insights,
      affectedPairs: pairs,
      recommendation: results[0]?.priceDirectionReasoning ?? 'Ver análisis individual.',
    };
  }
}
