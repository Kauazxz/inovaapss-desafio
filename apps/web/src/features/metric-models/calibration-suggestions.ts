/**
 * Costura entre a calibração (§26) e o configurador (§41).
 *
 * A coluna "Peso sugerido" existe para responder "o histórico concorda com o peso que a empresa
 * escolheu?". Quem sabe disso é a calibração: ela roda o modelo sobre os cancelamentos reais e
 * devolve um peso sugerido por métrica. Aqui só buscamos a execução mais recente que terminou
 * sobre alguma versão DESTE modelo e entregamos os pesos já indexados por métrica.
 *
 * O número é informação, nunca ação: ele aparece ao lado do peso da empresa e ninguém o aplica
 * sozinho. Quem quiser adotá-lo usa a própria tela de calibração, que cria um rascunho.
 */
import type { CalibrationRunSummaryDto } from '@inovaapss/shared';

import { useCalibrationRun, useCalibrationRuns } from '@/features/calibration/api';

export interface CalibrationSuggestions {
  /** metricDefinitionId → peso sugerido, na mesma escala do configurador (fração 0–1). */
  weightByMetricId: Map<string, number>;
  /** Quando a execução terminou, para a tela dizer de quando é o número. */
  finishedAt: string | null;
  windowDays: number;
  /** Versão do modelo que foi calibrada — pode não ser a que está aberta no editor. */
  version: number | null;
}

/**
 * A execução mais recente que terminou (`done`) sobre uma das versões informadas.
 *
 * O histórico vem do servidor da mais nova para a mais antiga, mas não dependemos disso: a
 * ordenação por `createdAt` aqui deixa a escolha explícita e estável.
 */
export function latestDoneRun(
  runs: readonly CalibrationRunSummaryDto[],
  versionIds: readonly string[],
): CalibrationRunSummaryDto | null {
  const wanted = new Set(versionIds);
  const candidates = runs
    .filter((run) => run.status === 'done' && wanted.has(run.metricModelVersionId))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  return candidates[0] ?? null;
}

/**
 * Pesos sugeridos pela última calibração deste modelo, ou `null` enquanto não houver nenhuma.
 *
 * Sem calibração a coluna continua mostrando "—": é o estado honesto: ninguém mediu ainda.
 */
export function useCalibrationSuggestions(
  versionIds: readonly string[],
): CalibrationSuggestions | null {
  const runs = useCalibrationRuns();
  const run = latestDoneRun(runs.data?.items ?? [], versionIds);
  const detail = useCalibrationRun(run?.id ?? null);

  const results = detail.data?.results;
  if (run === null || results === undefined || results === null) return null;

  return {
    weightByMetricId: new Map(
      results.suggestions.map((suggestion) => [suggestion.metricId, suggestion.suggestedWeight]),
    ),
    finishedAt: run.finishedAt,
    windowDays: run.windowDays,
    version: run.version,
  };
}

/**
 * A frase do rodapé da tabela: de onde veio o número que está na coluna "Peso sugerido".
 *
 * Dizer a origem importa porque as duas fontes significam coisas diferentes: a proposta de
 * redistribuição é aritmética (reparte o que sobra), a calibração é evidência (o que o histórico
 * de cancelamentos mostrou).
 */
export function suggestedWeightNote(
  calibration: CalibrationSuggestions | null,
  hasProposal: boolean,
): string {
  if (hasProposal) {
    return 'Peso sugerido é a proposta de redistribuição que está na tela; nada muda sem você aplicar.';
  }
  if (calibration === null) {
    return 'Peso sugerido vem da calibração com o histórico de cancelamentos; enquanto ninguém rodar uma, a coluna fica em “—”.';
  }
  const quando =
    calibration.finishedAt === null
      ? ''
      : ` de ${new Date(calibration.finishedAt).toLocaleDateString('pt-BR')}`;
  const versao = calibration.version === null ? '' : ` sobre a versão ${calibration.version}`;
  return `Peso sugerido vem da calibração${quando}${versao}, na janela de ${calibration.windowDays} dias; é leitura do histórico, não uma mudança aplicada.`;
}
