/**
 * Scores por métrica de um cliente (§8, §29, §40) — resposta de `GET /clients/:id/scores`.
 *
 * Alinhado ao `MetricScore` do motor (`packages/engine/src/scoring/types.ts`) e às colunas de
 * `metric_score_snapshots` (§36). O engine depende deste pacote, então os tipos do motor não
 * podem ser importados aqui; os campos abaixo têm o mesmo nome e o mesmo significado, e a API
 * (módulo `client-health`) faz a cópia campo a campo quando monta a resposta.
 */
import type { MetricDirection, MetricType } from '../domain.js';
import type { HealthClass } from '../scoring.js';
import type { ClientHealthDimension } from './dimensions.js';

/** Direção do valor bruto entre o período anterior e o atual (mesmo vocabulário do motor). */
export type RawTrendDirection = 'up' | 'down' | 'stable' | null;

/** Um período da série de uma métrica, já com o que os gráficos das abas precisam. */
export interface MetricPeriodPointDto {
  /** period_end (ISO 8601). */
  periodEnd: string;
  /** Rótulo curto para o eixo (ex.: "set/26", "3º tri/26"). */
  label: string;
  /** Valor bruto no período; `null` = não medido ou N/A (nunca zero por ausência — §21, §22). */
  value: number | null;
  /** current_health do período (0–100) ou `null`. */
  health: number | null;
  /** Baseline do próprio cliente usado na normalização (§9 BASELINE_DEVIATION), quando houver. */
  baseline: number | null;
  /** Média da carteira no mesmo período, para a linha cinza de comparação (DATAVIZ.md §4.3). */
  portfolioValue: number | null;
  /** Por que o valor é N/A, em português ("não respondeu", "sem reunião prevista"). */
  naReason: string | null;
  /** Campos auxiliares da métrica (ex.: `{ planned: 2, completed: 1 }`, `{ answered: false }`). */
  extra?: Record<string, number | string | boolean | null>;
}

/** Explicação estruturada da métrica (mesmo formato de `explanation_json`). */
export interface MetricExplanationDto {
  /** Frase principal em português ("Cumprimento de SLA caiu 24 p.p. em 3 meses."). */
  summary: string;
  /** Uma linha por componente (atual, tendência, persistência). */
  components: string[];
  /** Observações (confiança reduzida, gatilhos, N/A). */
  notes: string[];
}

/** O score de uma métrica no período atual, com a série que alimenta a aba da dimensão. */
export interface MetricScoreDto {
  metricId: string;
  /** Chave estável do preset (ex.: `sla_compliance`); `null` para métricas próprias. */
  metricKey: string | null;
  metricName: string;
  dimension: ClientHealthDimension;
  type: MetricType | null;
  /** Unidade para textos: `%`, `h`, `dias`, `chamados`... */
  unit: string | null;
  direction: MetricDirection;
  /** Peso configurado no modelo (fração 0–1). */
  weight: number;
  /** Peso normalizado entre as métricas disponíveis (0–1) — o mesmo de `EvidenceDto.weight`. */
  normalizedWeight: number;
  /** metric_health 0–100 ou `null` quando a métrica não pôde ser avaliada. */
  metricHealth: number | null;
  currentHealth: number | null;
  trendHealth: number | null;
  persistenceHealth: number | null;
  /** 0–100: proporção do peso dos componentes que puderam ser calculados (§8). */
  confidence: number;
  /** Classe do metric_health pelos thresholds vigentes; `null` quando N/A. */
  healthClass: HealthClass | null;
  /** Pontos de risco que a métrica tira do health geral: `normalizedWeight × (100 − metricHealth)`. */
  contribution: number;
  currentValue: number | null;
  previousValue: number | null;
  baselineValue: number | null;
  /** `currentValue − previousValue` na unidade da métrica. */
  delta: number | null;
  trend: RawTrendDirection;
  /** period_end do período atual (ISO 8601). */
  periodEnd: string | null;
  /** Por que a métrica está N/A ("sem reunião prevista no período"), ou `null`. */
  naReason: string | null;
  explanation: MetricExplanationDto;
  /** Série do mais antigo ao mais recente (o último é o período atual). */
  series: MetricPeriodPointDto[];
}

/** Resposta de `GET /clients/:id/scores`. */
export interface ClientScoresResponse {
  clientId: string;
  /** period_end do snapshot (ISO 8601). */
  periodEnd: string;
  /** Versão do modelo usada no cálculo (§31), ex.: "GlobalSys v1". */
  modelVersion: string;
  /** Na ordem do modelo (ordem de exibição fica a cargo da tela). */
  items: MetricScoreDto[];
}
