/**
 * Texto de explicabilidade (§58): nunca mostrar só "Risco = 83". Monta as linhas
 * "Health: 28/100 — Crítico", "Risk: 72/100", "Confiança: 94 %" e os principais drivers
 * numerados. Puro, sem `Intl`, para API e web produzirem a mesma frase.
 */
import { HEALTH_CLASS_LABELS, PRIORITY_CLASS_LABELS } from '../scoring.js';

import type { EvidenceDto } from './evidence.js';
import type { ClientScoreSummaryDto } from './overview.js';

/** Quantos drivers o resumo §58 lista no máximo. */
export const MAX_SUMMARY_DRIVERS = 4;

export interface HealthSummaryLines {
  /** "Health: 28/100 — Crítico" ou "Health: sem cálculo ainda". */
  health: string;
  /** "Risk: 72/100". */
  risk: string;
  /** "Prioridade: 88/100 — P0 — Imediata". */
  priority: string;
  /** "Confiança: 94 %". */
  confidence: string;
  /** "1. Chamados críticos aumentaram 180 % em 3 meses." … (1–4 linhas). */
  drivers: string[];
}

function scoreText(value: number | null): string {
  return value === null ? 'sem cálculo' : `${Math.round(value)}/100`;
}

/** As linhas do resumo §58 a partir do snapshot e dos drivers ordenados por contribuição. */
export function buildHealthSummaryLines(
  score: Pick<
    ClientScoreSummaryDto,
    | 'overallHealth'
    | 'healthClass'
    | 'riskScore'
    | 'analysisConfidence'
    | 'priorityScore'
    | 'priorityClass'
  > | null,
  drivers: readonly Pick<EvidenceDto, 'humanExplanation' | 'isNegative'>[],
): HealthSummaryLines {
  if (score === null) {
    return {
      health: 'Health: sem cálculo ainda',
      risk: 'Risk: sem cálculo ainda',
      priority: 'Prioridade: sem cálculo ainda',
      confidence: 'Confiança: 0 %',
      drivers: [],
    };
  }
  const healthClass =
    score.healthClass === null ? '' : ` — ${HEALTH_CLASS_LABELS[score.healthClass]}`;
  const priorityClass =
    score.priorityClass === null ? '' : ` — ${PRIORITY_CLASS_LABELS[score.priorityClass]}`;
  const negative = drivers.filter((driver) => driver.isNegative).slice(0, MAX_SUMMARY_DRIVERS);
  return {
    health: `Health: ${scoreText(score.overallHealth)}${healthClass}`,
    risk: `Risk: ${scoreText(score.riskScore)}`,
    priority: `Prioridade: ${scoreText(score.priorityScore)}${priorityClass}`,
    confidence: `Confiança: ${Math.round(score.analysisConfidence)} %`,
    drivers: negative.map((driver, index) => `${index + 1}. ${driver.humanExplanation}`),
  };
}
