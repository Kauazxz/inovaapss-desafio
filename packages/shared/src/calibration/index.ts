/**
 * Calibração (§26 e §27 de DEFINICOES_METRICAS.md; §33, §43 e §59 de SPEC.md).
 *
 * Os pesos das métricas começaram como um palpite informado. A base tem cancelamentos que de fato
 * aconteceram. Calibrar é rodar o modelo no passado e perguntar: ele teria avisado a tempo?
 * Daí saem os números desta tela — e uma proposta de pesos que alguém aprova ou recusa.
 */

export const CALIBRATION_RUN_STATUSES = ['queued', 'running', 'done', 'failed'] as const;
export type CalibrationRunStatus = (typeof CALIBRATION_RUN_STATUSES)[number];

export const CALIBRATION_RUN_STATUS_LABELS: Readonly<Record<CalibrationRunStatus, string>> = {
  queued: 'Na fila',
  running: 'Rodando',
  done: 'Concluída',
  failed: 'Falhou',
};

/** Janelas de antecedência oferecidas (§33): 30, 60 ou 90 dias. */
export const CALIBRATION_WINDOW_DAYS = [30, 60, 90] as const;
export type CalibrationWindowDays = (typeof CALIBRATION_WINDOW_DAYS)[number];

export const CALIBRATION_WINDOW_LABELS: Readonly<Record<CalibrationWindowDays, string>> = {
  30: '30 dias (1 mês)',
  60: '60 dias (2 meses)',
  90: '90 dias (3 meses)',
};

/** Como o sistema se saiu com um cancelamento específico. */
export interface CalibrationChurnOutcomeDto {
  clientId: string;
  clientName: string;
  churnPeriodEnd: string;
  caught: boolean;
  firstAlertPeriodEnd: string | null;
  leadPeriods: number | null;
}

export interface CalibrationTopNDto {
  n: number;
  slots: number;
  hits: number;
  precision: number | null;
  /** Teto teórico da janela: a melhor fila possível não passaria disto. */
  maxPrecision: number | null;
}

export interface CalibrationLeadTimeDto {
  meanPeriods: number | null;
  medianPeriods: number | null;
  meanDays: number | null;
  medianDays: number | null;
  sampleSize: number;
}

/** O desempenho de um conjunto de pesos sobre o histórico. */
export interface CalibrationBacktestDto {
  windowDays: number;
  periodDays: number;
  windowPeriods: number;
  alertRiskThreshold: number;
  periodsAnalyzed: number;
  pairsAnalyzed: number;
  clientsAnalyzed: number;
  churnsAnalyzed: number;
  churnsCaught: number;
  truePositives: number;
  falsePositives: number;
  trueNegatives: number;
  falseNegatives: number;
  precision: number | null;
  recall: number | null;
  churnDetectionRate: number | null;
  falsePositiveRate: number | null;
  f1: number | null;
  leadTime: CalibrationLeadTimeDto;
  topN: CalibrationTopNDto[];
  churnOutcomes: CalibrationChurnOutcomeDto[];
}

/** Uma linha da tabela Métrica | Peso atual | Peso sugerido | Importância | Mudança (§43). */
export interface CalibrationSuggestionDto {
  metricId: string;
  metricName: string;
  currentWeight: number;
  suggestedWeight: number;
  delta: number;
  historicalImportance: number;
  meanHealthChurned: number | null;
  meanHealthRetained: number | null;
  separation: number;
  sampleSizeChurned: number;
  sampleSizeRetained: number;
}

export interface CalibrationParametersDto {
  windowDays: number;
  periodDays: number;
  windowPeriods: number;
  alertRiskThreshold: number;
  suggestionStrength: number;
  minimumWeight: number;
  topN: number[];
}

/** O conteúdo de `results_json` de uma execução concluída. */
export interface CalibrationResultsDto {
  parameters: CalibrationParametersDto;
  baseline: CalibrationBacktestDto;
  proposed: CalibrationBacktestDto;
  suggestions: CalibrationSuggestionDto[];
  /** Nome e versão do modelo avaliado, para a execução se explicar sozinha no histórico. */
  model: {
    metricModelId: string;
    metricModelName: string;
    metricModelVersionId: string;
    version: number;
    status: string;
  };
}

/** Linha do histórico de execuções. */
export interface CalibrationRunSummaryDto {
  id: string;
  metricModelVersionId: string;
  metricModelName: string | null;
  version: number | null;
  windowDays: number;
  status: CalibrationRunStatus;
  churnsAnalyzed: number | null;
  churnsCaught: number | null;
  precision: number | null;
  churnDetectionRate: number | null;
  errorMessage: string | null;
  createdAt: string;
  finishedAt: string | null;
}

export interface CalibrationRunDto extends CalibrationRunSummaryDto {
  parameters: CalibrationParametersDto | null;
  results: CalibrationResultsDto | null;
}

export interface CalibrationRunsResponse {
  items: CalibrationRunSummaryDto[];
}

/** Corpo de POST /calibration/runs. */
export interface CreateCalibrationRunBody {
  windowDays?: number | undefined;
  /** Versão a avaliar; sem ela, a versão ativa do modelo ativo. */
  metricModelVersionId?: string | undefined;
  alertRiskThreshold?: number | undefined;
  suggestionStrength?: number | undefined;
}

/** Corpo de POST /calibration/runs/:id/apply-suggestions. */
export interface ApplyCalibrationSuggestionsBody {
  /** Métricas cujo peso sugerido foi aceito. As demais mantêm o peso atual. */
  acceptedMetricIds: string[];
}

export interface ApplyCalibrationSuggestionsResponse {
  metricModelId: string;
  metricModelVersionId: string;
  version: number;
  status: string;
  /** Pesos gravados no rascunho, na ordem do modelo. */
  weights: { metricId: string; metricName: string; weight: number }[];
  /** Lembrete: rascunho não muda nada até alguém ativar (§32). */
  message: string;
}

/**
 * Texto que a tela usa para explicar cada número. Fica aqui, e não no componente, porque é
 * vocabulário de domínio: a mesma frase serve para a UI, para o e-mail e para a documentação.
 */
export const CALIBRATION_GLOSSARY = {
  churnsAnalyzed:
    'Cancelamentos com histórico suficiente para serem testados. É a base de tudo o que vem abaixo.',
  churnDetectionRate:
    'De cada 100 cancelamentos, quantos tiveram alerta dentro da janela escolhida. É o "ele avisou?".',
  precision:
    'De cada 100 alertas emitidos, quantos viraram cancelamento de verdade. É o "ele avisou à toa?".',
  falsePositiveRate:
    'Entre os meses em que o cliente NÃO ia sair, em quantos o sistema alertou mesmo assim. Alto demais, a equipe para de olhar a fila.',
  leadTime:
    'Quanto tempo antes da saída veio o primeiro alerta. Curto demais não dá tempo de agir.',
  precisionAtN:
    'Entre os clientes no topo da fila de prioridade, quantos estavam mesmo prestes a sair. Mede o que a equipe realmente olha, não a lista inteira.',
  recall:
    'Dos meses que antecederam uma saída, em quantos houve alerta. Diferente do acerto por cliente: aqui um cancelamento avisado três vezes conta três.',
} as const;

/** O aviso que acompanha qualquer número desta tela. */
export const CALIBRATION_SMALL_SAMPLE_WARNING =
  'A base tem poucas saídas. Com essa quantidade, os números têm margem larga: servem para orientar a conversa sobre pesos, não para decidir sozinhos.';
