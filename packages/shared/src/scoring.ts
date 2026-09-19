// ---------- §7 Classe de saúde (health 0–100; 100 = saudável) ----------
export const HEALTH_CLASSES = ['NORMAL', 'ATTENTION', 'RISK', 'CRITICAL'] as const;
export type HealthClass = (typeof HEALTH_CLASSES)[number];
export const HealthClass = {
  NORMAL: 'NORMAL',
  ATTENTION: 'ATTENTION',
  RISK: 'RISK',
  CRITICAL: 'CRITICAL',
} as const satisfies Record<string, HealthClass>;

/** Rótulos em português para a interface (§7). */
export const HEALTH_CLASS_LABELS: Readonly<Record<HealthClass, string>> = {
  NORMAL: 'Normal',
  ATTENTION: 'Atenção',
  RISK: 'Risco',
  CRITICAL: 'Crítico',
};

// ---------- §28 Classe de prioridade de atendimento ----------
export const PRIORITY_CLASSES = ['P0', 'P1', 'P2', 'P3'] as const;
export type PriorityClass = (typeof PRIORITY_CLASSES)[number];
export const PriorityClass = {
  P0: 'P0',
  P1: 'P1',
  P2: 'P2',
  P3: 'P3',
} as const satisfies Record<string, PriorityClass>;

/** Rótulos em português para a interface (§28). */
export const PRIORITY_CLASS_LABELS: Readonly<Record<PriorityClass, string>> = {
  P0: 'P0 — Imediata',
  P1: 'P1 — Alta',
  P2: 'P2 — Média',
  P3: 'P3 — Normal',
};

/**
 * Faixa de classificação: a classe vale a partir de `min` (inclusive).
 * A última faixa (menor `min`) recebe tudo o que sobrar.
 */
export interface ClassBand<TClass extends string> {
  readonly class: TClass;
  readonly min: number;
}

/** §7 — faixas padrão de health: 80/60/40. Configuráveis por organização. */
export const DEFAULT_HEALTH_BANDS: readonly ClassBand<HealthClass>[] = [
  { class: 'NORMAL', min: 80 },
  { class: 'ATTENTION', min: 60 },
  { class: 'RISK', min: 40 },
  { class: 'CRITICAL', min: 0 },
];

/** §28 — faixas padrão de prioridade: 85/70/50. Configuráveis por organização. */
export const DEFAULT_PRIORITY_BANDS: readonly ClassBand<PriorityClass>[] = [
  { class: 'P0', min: 85 },
  { class: 'P1', min: 70 },
  { class: 'P2', min: 50 },
  { class: 'P3', min: 0 },
];

// ---------- §8 Pesos padrão dos componentes de cada métrica ----------
export interface ComponentWeights {
  readonly current: number;
  readonly trend: number;
  readonly persistence: number;
}
export const DEFAULT_COMPONENT_WEIGHTS: ComponentWeights = {
  current: 0.45,
  trend: 0.35,
  persistence: 0.2,
};

// ---------- §28 Pesos padrão da prioridade (risco × impacto comercial) ----------
export interface PriorityWeights {
  readonly risk: number;
  readonly impact: number;
}
export const DEFAULT_PRIORITY_WEIGHTS: PriorityWeights = {
  risk: 0.7,
  impact: 0.3,
};

// ---------- §10 e §11 Janelas padrão de tendência e persistência ----------
export const DEFAULT_TREND_WINDOW_PERIODS = 3;
export const DEFAULT_PERSISTENCE_WINDOW_PERIODS = 3;

/** Escala oficial de todos os scores (§7, §24, §26, §28). */
export const SCORE_MIN = 0;
export const SCORE_MAX = 100;

/** Limita o valor à escala 0–100 (NaN vira 0: dado inválido nunca parece saudável). */
export function clampScore(value: number): number {
  if (Number.isNaN(value)) return SCORE_MIN;
  return Math.min(SCORE_MAX, Math.max(SCORE_MIN, value));
}

/**
 * Classifica um score: a primeira faixa (da maior para a menor) cujo `min` o score alcança.
 * Regra pura: sem acesso a banco, sem efeitos colaterais (§3).
 */
export function classifyByBands<TClass extends string>(
  score: number,
  bands: readonly ClassBand<TClass>[],
): TClass {
  const ordered = [...bands].sort((a, b) => b.min - a.min);
  const fallback = ordered[ordered.length - 1];
  if (fallback === undefined) {
    throw new Error('classifyByBands: é preciso ao menos uma faixa de classificação.');
  }
  const value = clampScore(score);
  return (ordered.find((band) => value >= band.min) ?? fallback).class;
}

/** §7 — Normal/Atenção/Risco/Crítico a partir do health 0–100. */
export function classifyHealth(
  healthScore: number,
  bands: readonly ClassBand<HealthClass>[] = DEFAULT_HEALTH_BANDS,
): HealthClass {
  return classifyByBands(healthScore, bands);
}

/** §28 — P0–P3 a partir do priority_score 0–100. */
export function classifyPriority(
  priorityScore: number,
  bands: readonly ClassBand<PriorityClass>[] = DEFAULT_PRIORITY_BANDS,
): PriorityClass {
  return classifyByBands(priorityScore, bands);
}

/** §26 — risco é o complemento da saúde; nunca uma segunda verdade. */
export function riskFromHealth(overallHealth: number): number {
  return SCORE_MAX - clampScore(overallHealth);
}
