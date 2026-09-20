/**
 * Evidências (§29) — resposta de `GET /clients/:id/evidence`.
 *
 * `EvidenceDto` tem exatamente os campos de `EvidenceDriver` do motor (`buildEvidence` em
 * `packages/engine/src/scoring/evidence.ts`) mais o contexto que a tela precisa (chave,
 * dimensão, unidade, posição). A API copia o driver e completa o resto.
 */
import type { ClientHealthDimension } from './dimensions.js';
import type { RawTrendDirection } from './scores.js';

export interface EvidenceDto {
  // ---- campos de EvidenceDriver (§29) ----
  metricId: string;
  metricName: string;
  currentValue: number | null;
  baselineValue: number | null;
  /** Último − anterior (unidade da métrica). */
  delta: number | null;
  /** `up` | `down` | `stable` em termos de valor bruto; `null` sem histórico. */
  trend: RawTrendDirection;
  /** Saúde da métrica (0–100). */
  healthScore: number | null;
  /** Peso normalizado (0–1) entre as métricas disponíveis. */
  weight: number;
  /** Pontos de risco que a métrica contribui: weight × (100 − health). */
  contribution: number;
  humanExplanation: string;
  /** true quando a métrica está puxando a saúde para baixo. */
  isNegative: boolean;

  // ---- contexto para a tela ----
  metricKey: string | null;
  dimension: ClientHealthDimension;
  unit: string | null;
  /** Posição na lista ordenada por contribuição (1 = principal evidência). */
  rank: number;
}

/** Resposta de `GET /clients/:id/evidence`: ordenada por `contribution` decrescente. */
export interface ClientEvidenceResponse {
  clientId: string;
  periodEnd: string;
  items: EvidenceDto[];
}
