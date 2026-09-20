/**
 * Calibração (§26, §33, §43): rodar o backtest, ler o histórico e aceitar os pesos sugeridos.
 *
 * Aceitar sugestão NÃO muda a carteira: cria um rascunho de versão. Por isso a mutação
 * invalida também as consultas de modelos — o rascunho novo precisa aparecer lá.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import type {
  ApplyCalibrationSuggestionsResponse,
  CalibrationRunDto,
  CalibrationRunSummaryDto,
} from '@inovaapss/shared';

import { apiFetch } from '@/lib/api';

/** Uma versão do modelo que já tem histórico gravado — só essas dá para calibrar. */
export interface CalibrationVersionOption {
  metricModelVersionId: string;
  metricModelName: string;
  version: number;
  status: string;
  snapshotCount: number;
}

export const calibrationKeys = {
  all: ['calibration'] as const,
  versions: () => ['calibration', 'versions'] as const,
  runs: () => ['calibration', 'runs'] as const,
  run: (id: string) => ['calibration', 'run', id] as const,
};

export function useCalibrationVersions() {
  return useQuery({
    queryKey: calibrationKeys.versions(),
    queryFn: () => apiFetch<{ items: CalibrationVersionOption[] }>('/api/v1/calibration/versions'),
    staleTime: 60_000,
  });
}

export function useCalibrationRuns() {
  return useQuery({
    queryKey: calibrationKeys.runs(),
    queryFn: () => apiFetch<{ items: CalibrationRunSummaryDto[] }>('/api/v1/calibration/runs'),
    staleTime: 30_000,
  });
}

export function useCalibrationRun(id: string | null) {
  return useQuery({
    queryKey: calibrationKeys.run(id ?? 'nenhuma'),
    queryFn: () =>
      apiFetch<CalibrationRunDto>(`/api/v1/calibration/runs/${encodeURIComponent(id ?? '')}`),
    enabled: id !== null,
    staleTime: 5 * 60_000,
  });
}

export interface RunCalibrationInput {
  windowDays: number;
  metricModelVersionId?: string | undefined;
}

export function useRunCalibration() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: RunCalibrationInput) =>
      apiFetch<CalibrationRunDto>('/api/v1/calibration/runs', { method: 'POST', json: input }),
    onSuccess: (run) => {
      queryClient.setQueryData(calibrationKeys.run(run.id), run);
      void queryClient.invalidateQueries({ queryKey: calibrationKeys.runs() });
    },
  });
}

export function useApplySuggestions() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ runId, acceptedMetricIds }: { runId: string; acceptedMetricIds: string[] }) =>
      apiFetch<ApplyCalibrationSuggestionsResponse>(
        `/api/v1/calibration/runs/${encodeURIComponent(runId)}/apply-suggestions`,
        { method: 'POST', json: { acceptedMetricIds } },
      ),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['metric-models'] });
      void queryClient.invalidateQueries({ queryKey: calibrationKeys.versions() });
    },
  });
}
