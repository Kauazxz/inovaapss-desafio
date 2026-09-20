/**
 * Calibração (§26 e §27 de DEFINICOES_METRICAS.md; §33, §43 e §59 de SPEC.md).
 *
 * Calibrar é perguntar ao passado: "com estes pesos, o sistema teria avisado a tempo?".
 * Rodamos o modelo sobre o histórico, comparamos com os cancelamentos que de fato aconteceram e
 * medimos acerto, alarme falso e antecedência. Só então propomos pesos melhores — que uma pessoa
 * aprova ou recusa (modo Assistido, §25).
 *
 * REGRA DE OURO (§27 e §59): ao avaliar o período `t` usamos apenas o que era conhecido até `t`.
 * O cancelamento é **alvo de validação**, nunca entrada do score.
 */

/** Peso de uma métrica dentro de uma versão do modelo. `weight` é fração 0–1. */
export interface CalibrationWeight {
  metricId: string;
  metricName: string;
  weight: number;
}

/** Uma foto do cliente num período: a saúde de cada métrica e o impacto comercial. */
export interface CalibrationPeriodPoint {
  /** Fim do período (ISO 8601, data). Ordena a série e forma a grade de períodos. */
  periodEnd: string;
  /** Saúde 0–100 por métrica (chave = metricId). `null` = não avaliável naquele período. */
  metricHealth: Readonly<Record<string, number | null>>;
  /** §20: impacto comercial gravado na foto. Não depende dos pesos, então é reaproveitado. */
  commercialImpactScore: number | null;
  /** Saúde registrada na foto; só é usada quando não há saúde por métrica no período. */
  recordedHealthScore?: number | null;
}

/** A série histórica de um cliente e, se ele saiu, o período da saída. */
export interface CalibrationClientSeries {
  clientId: string;
  clientName: string;
  periods: readonly CalibrationPeriodPoint[];
  /**
   * Fim do período em que o cliente cancelou (ISO 8601) ou `null` se segue na carteira.
   * Entra só na validação — jamais no cálculo do score (§27).
   */
  churnPeriodEnd: string | null;
}

export interface BacktestOptions {
  /** Janela de antecedência em dias: 30, 60 ou 90 (§33). */
  windowDays?: number | undefined;
  /** Duração de um período em dias (padrão 30 = mensal). */
  periodDays?: number | undefined;
  /**
   * Risco a partir do qual consideramos que o sistema "alertou" (padrão 41, ou seja, saúde ≤ 59 —
   * as faixas Risco e Crítico de §2).
   */
  alertRiskThreshold?: number | undefined;
  /** Tamanhos da fila avaliados em precision@N (padrão 5 e 10). */
  topN?: readonly number[] | undefined;
}

/** Um par (cliente, período) já avaliado — a unidade de contagem do backtest. */
export interface BacktestPeriodRow {
  clientId: string;
  periodEnd: string;
  /** Saúde recalculada com os pesos avaliados. `null` = sem métrica disponível. */
  healthScore: number | null;
  riskScore: number | null;
  priorityScore: number | null;
  /** O modelo alertou neste período? */
  alerted: boolean;
  /** O cliente cancelou dentro da janela contada a partir deste período? */
  churnedWithinWindow: boolean;
  /** Períodos entre este e a saída; `null` para quem não cancelou. */
  periodsUntilChurn: number | null;
}

export interface TopNPrecision {
  n: number;
  /** Quantas vagas do topo foram preenchidas (soma de min(n, clientes do período)). */
  slots: number;
  /** Quantas dessas vagas eram mesmo um cancelamento dentro da janela. */
  hits: number;
  /** hits / slots. `null` quando não houve vaga alguma. */
  precision: number | null;
  /**
   * Teto teórico: a melhor fila possível acertaria no máximo isto. Com poucos cancelamentos por
   * período o número fica baixo por construção — sem esta referência, precision@N engana.
   */
  maxPrecision: number | null;
}

export interface LeadTimeSummary {
  /** Média de períodos entre o primeiro alerta e a saída. `null` sem cancelamento detectado. */
  meanPeriods: number | null;
  medianPeriods: number | null;
  meanDays: number | null;
  medianDays: number | null;
  /** Quantos cancelamentos entraram na média. */
  sampleSize: number;
}

/** Como o modelo se saiu com um cancelamento específico. */
export interface ChurnOutcome {
  clientId: string;
  clientName: string;
  churnPeriodEnd: string;
  /** Houve alerta dentro da janela imediatamente anterior à saída? */
  caught: boolean;
  /** Primeiro período com alerta em toda a série; `null` se o modelo nunca alertou. */
  firstAlertPeriodEnd: string | null;
  /** Períodos entre o primeiro alerta e a saída; `null` se nunca alertou. */
  leadPeriods: number | null;
}

export interface BacktestResult {
  windowDays: number;
  periodDays: number;
  /** Janela convertida em períodos (30 dias = 1 mês, 90 = 3). */
  windowPeriods: number;
  alertRiskThreshold: number;
  /** Períodos distintos da grade em que houve alguma avaliação. */
  periodsAnalyzed: number;
  /** Pares (cliente, período) avaliados. */
  pairsAnalyzed: number;
  clientsAnalyzed: number;
  /** Cancelamentos com histórico suficiente para serem avaliados. */
  churnsAnalyzed: number;
  /** Cancelamentos que tiveram alerta dentro da janela. */
  churnsCaught: number;
  truePositives: number;
  falsePositives: number;
  trueNegatives: number;
  falseNegatives: number;
  /** TP / (TP + FP) — de cada 100 alertas, quantos viraram cancelamento. */
  precision: number | null;
  /** TP / (TP + FN), no par (cliente, período). */
  recall: number | null;
  /** Cancelamentos pegos / cancelamentos analisados — a leitura de quem gere a carteira. */
  churnDetectionRate: number | null;
  /** FP / (FP + TN) — quanto do "tudo bem" virou alarme. */
  falsePositiveRate: number | null;
  /** Média harmônica de precision e recall, para comparar duas propostas num número só. */
  f1: number | null;
  leadTime: LeadTimeSummary;
  topN: readonly TopNPrecision[];
  /** Um item por cancelamento analisado, na ordem do período de saída. */
  churnOutcomes: readonly ChurnOutcome[];
  /** Linha a linha, para os testes e para quem quiser auditar. */
  rows: readonly BacktestPeriodRow[];
}

/** O que muda para uma métrica se a sugestão for aceita (§33: peso atual, sugerido, diferença). */
export interface WeightSuggestion {
  metricId: string;
  metricName: string;
  currentWeight: number;
  suggestedWeight: number;
  /** suggestedWeight − currentWeight. */
  delta: number;
  /**
   * Importância histórica 0–1: o quanto esta métrica separou quem cancelou de quem ficou,
   * normalizada para somar 1 entre todas as métricas.
   */
  historicalImportance: number;
  /** Saúde média da métrica nos períodos anteriores a um cancelamento. */
  meanHealthChurned: number | null;
  /** Saúde média da métrica nos demais períodos. */
  meanHealthRetained: number | null;
  /** Separação padronizada (d de Cohen) entre os dois grupos; 0 = a métrica não separa nada. */
  separation: number;
  /** Quantas observações sustentam a separação. */
  sampleSizeChurned: number;
  sampleSizeRetained: number;
}

export interface SuggestionOptions extends BacktestOptions {
  /**
   * Quanto a sugestão anda em direção à importância histórica, de 0 a 1 (padrão 0,5).
   * Com 22 cancelamentos a amostra é pequena: puxar o peso todo para o histórico seria
   * confiar demais em pouca evidência. Metade do caminho é o encolhimento que assumimos.
   */
  suggestionStrength?: number | undefined;
  /** Peso mínimo que uma métrica mantém na proposta (padrão 0,01 = 1 %). */
  minimumWeight?: number | undefined;
}

export interface CalibrationResult {
  /** Parâmetros efetivamente usados — voltam na resposta para a execução ser reproduzível. */
  parameters: {
    windowDays: number;
    periodDays: number;
    windowPeriods: number;
    alertRiskThreshold: number;
    suggestionStrength: number;
    minimumWeight: number;
    topN: readonly number[];
  };
  /** O desempenho dos pesos que estão valendo hoje. */
  baseline: BacktestResult;
  /** O desempenho estimado se os pesos sugeridos fossem adotados. */
  proposed: BacktestResult;
  suggestions: readonly WeightSuggestion[];
}
