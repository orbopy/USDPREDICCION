import type { LLMContext } from '../../shared/types/MarketData';

interface MacroIndicators {
  inflacionMensual?: number;   // % mensual ARS
  brechaCambiaria?: number;    // % entre oficial y blue
  reservasBCRA?: number;       // USD millones
  riesgosPais?: number;        // puntos básicos
}

export class MacroAgent {
  readonly id = 'macro-agent';
  readonly type = 'MACRO';
  readonly weight = 0.25;

  evaluate(indicators: MacroIndicators, llmContext: LLMContext | null): { score: number; confidence: number } {
    let score = 0;
    let signals = 0;

    // Brecha cambiaria: >80% → presión muy alta sobre blue
    if (indicators.brechaCambiaria !== undefined) {
      if (indicators.brechaCambiaria > 100) { score += 0.8; signals++; }
      else if (indicators.brechaCambiaria > 80) { score += 0.5; signals++; }
      else if (indicators.brechaCambiaria > 50) { score += 0.2; signals++; }
      else if (indicators.brechaCambiaria < 20) { score -= 0.3; signals++; }
    }

    // Inflación: >8% mensual es señal de presión sobre ARS
    if (indicators.inflacionMensual !== undefined) {
      if (indicators.inflacionMensual > 10) { score += 0.6; signals++; }
      else if (indicators.inflacionMensual > 5) { score += 0.3; signals++; }
      else if (indicators.inflacionMensual < 2) { score -= 0.2; signals++; }
    }

    // Reservas BCRA bajas → presión alcista blue
    if (indicators.reservasBCRA !== undefined) {
      if (indicators.reservasBCRA < 5000) { score += 0.7; signals++; }
      else if (indicators.reservasBCRA < 15000) { score += 0.3; signals++; }
      else if (indicators.reservasBCRA > 30000) { score -= 0.2; signals++; }
    }

    // Riesgo país: >2000 → crisis, presión alcista
    if (indicators.riesgosPais !== undefined) {
      if (indicators.riesgosPais > 2000) { score += 0.5; signals++; }
      else if (indicators.riesgosPais > 1000) { score += 0.2; signals++; }
      else if (indicators.riesgosPais < 500) { score -= 0.1; signals++; }
    }

    // Refuerzo con contexto LLM
    if (llmContext?.impactLevel === 'HIGH') {
      const llmDir = llmContext.sentiment === 'BULLISH' ? 0.2 : llmContext.sentiment === 'BEARISH' ? -0.2 : 0;
      score += llmDir;
      signals++;
    }

    if (signals === 0) return { score: 0, confidence: 0.1 };

    const normalized = Math.max(-1, Math.min(1, score / signals));
    const confidence = Math.min(0.9, 0.3 + signals * 0.12);

    return { score: normalized, confidence };
  }
}
