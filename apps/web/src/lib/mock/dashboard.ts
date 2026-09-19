/**
 * DADOS DE EXEMPLO (MOCK) do dashboard — Etapa 0.
 *
 * Nada aqui vem do banco. Serve para a tela /dashboard existir antes da API (Etapa 8 liga em
 * `GET /dashboard/risk`, ver DATAVIZ.md §5.4). Quando a API entrar, este arquivo some e os tipos
 * passam a vir de `@inovaapss/shared` (`packages/shared/src/dashboard/forecast.ts`).
 */
import {
  classifyHealth,
  classifyPriority,
  type HealthClass,
  type PriorityClass,
} from '@inovaapss/shared';

/** Uma linha do ranking priorizado (subconjunto do `ForecastRow` de DATAVIZ.md §5.4). */
export interface MockForecastRow {
  clientId: string;
  clientName: string;
  /** Valor mensal do contrato (MRR), em BRL. */
  mrr: number;
  /** Ordena a lista (decrescente). 0–100. */
  priorityScore: number;
  priorityClass: PriorityClass;
  healthCurrent: number;
  currentClass: HealthClass;
  /** `null` = histórico insuficiente para projetar. */
  healthProjected: number | null;
  projectedClass: HealthClass | null;
  /** true quando a classe projetada é Risco ou Crítico e é pior que a atual. É o que recebe cor. */
  crossesDown: boolean;
  /** analysis_confidence do último snapshot (0–100). */
  confidence: number;
  /** human_explanation do driver com maior contribuição negativa. */
  topEvidence: string;
}

const CLASS_ORDER: Readonly<Record<HealthClass, number>> = {
  NORMAL: 0,
  ATTENTION: 1,
  RISK: 2,
  CRITICAL: 3,
};

interface MockSeed {
  clientId: string;
  clientName: string;
  mrr: number;
  priorityScore: number;
  healthCurrent: number;
  healthProjected: number | null;
  confidence: number;
  topEvidence: string;
}

/** Mesmo exemplo do ASCII de DATAVIZ.md §5.3, para o gráfico bater com o guia. */
const SEEDS: readonly MockSeed[] = [
  {
    clientId: 'mock-alfa',
    clientName: 'Alfa Ltda',
    mrr: 12_000,
    priorityScore: 92,
    healthCurrent: 31,
    healthProjected: 22,
    confidence: 88,
    topEvidence: 'Chamados críticos +180 % em 3 meses',
  },
  {
    clientId: 'mock-beta',
    clientName: 'Beta S.A.',
    mrr: 8_500,
    priorityScore: 84,
    healthCurrent: 61,
    healthProjected: 46,
    confidence: 91,
    topEvidence: 'SLA caiu 24 p.p.',
  },
  {
    clientId: 'mock-gama',
    clientName: 'Gama ME',
    mrr: 3_200,
    priorityScore: 77,
    healthCurrent: 44,
    healthProjected: 35,
    confidence: 76,
    topEvidence: 'Taxa de reabertura dobrou',
  },
  {
    clientId: 'mock-delta',
    clientName: 'Delta Corp',
    mrr: 20_000,
    priorityScore: 63,
    healthCurrent: 66,
    healthProjected: 72,
    confidence: 83,
    topEvidence: '2 reuniões previstas não ocorreram',
  },
  {
    clientId: 'mock-epsilon',
    clientName: 'Épsilon',
    mrr: 6_100,
    priorityScore: 58,
    healthCurrent: 71,
    healthProjected: 57,
    confidence: 79,
    topEvidence: 'Uso 19 % abaixo do baseline',
  },
  {
    clientId: 'mock-omega',
    clientName: 'Ômega',
    mrr: 1_100,
    priorityScore: 21,
    healthCurrent: 88,
    healthProjected: null,
    confidence: 40,
    topEvidence: 'sem histórico — sem projeção',
  },
];

function buildRow(seed: MockSeed): MockForecastRow {
  const currentClass = classifyHealth(seed.healthCurrent);
  const projectedClass =
    seed.healthProjected === null ? null : classifyHealth(seed.healthProjected);
  const crossesDown =
    projectedClass !== null &&
    (projectedClass === 'RISK' || projectedClass === 'CRITICAL') &&
    CLASS_ORDER[projectedClass] > CLASS_ORDER[currentClass];
  return {
    ...seed,
    priorityClass: classifyPriority(seed.priorityScore),
    currentClass,
    projectedClass,
    crossesDown,
  };
}

/** Ranking por prioridade (decrescente) — o primeiro é o primeiro a ligar. */
export const MOCK_FORECAST_ROWS: readonly MockForecastRow[] = SEEDS.map(buildRow).sort(
  (a, b) => b.priorityScore - a.priorityScore,
);

/** Quantas linhas cruzam para Risco/Crítico — vira o título do gráfico. */
export const MOCK_CROSSING_COUNT = MOCK_FORECAST_ROWS.filter((row) => row.crossesDown).length;

/** Os 4 números da linha de cima da aba "Em risco" (DATAVIZ.md §4.1). */
export const MOCK_RISK_SUMMARY = {
  activeClients: 48,
  criticalClients: 5,
  riskClients: 7,
  /** MRR somado dos clientes em Risco + Crítico, em BRL. */
  mrrAtRisk: 84_300,
} as const;
