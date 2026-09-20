/**
 * Publicar o que foi editado na tabela (§32, §41).
 *
 * A versão em vigor é imutável, então "publicar" são três passos encadeados: abrir um rascunho
 * (quando ainda não há um), gravar os itens nele e ativá-lo. Quem usa a tela não precisa saber
 * disso — só aperta Publicar; o histórico continua guardado com os scores que cada versão gerou.
 */
import { useMutation, useQueryClient } from '@tanstack/react-query';

import type { MetricModelItemBody } from '@inovaapss/validation';

import {
  activateMetricModelVersion,
  createMetricModelVersion,
  metricModelsKeys,
  updateMetricModelVersion,
} from '@/features/metric-models/api';

import { metricsKeys } from './api';

export interface PublishVars {
  modelId: string;
  /** Rascunho já aberto no servidor; `null` abre um novo a partir da versão em vigor. */
  draftVersion: number | null;
  items: MetricModelItemBody[];
}

export async function publishModelDraft({
  modelId,
  draftVersion,
  items,
}: PublishVars): Promise<number> {
  const version = draftVersion ?? (await createMetricModelVersion({ modelId })).version.version;
  await updateMetricModelVersion({ modelId, version, items });
  await activateMetricModelVersion({ modelId, version });
  return version;
}

export function usePublishModelDraft() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: publishModelDraft,
    onSuccess: () => {
      // A lista de métricas carrega o `activePlacement` da versão ativa: ela muda junto.
      void queryClient.invalidateQueries({ queryKey: metricModelsKeys.all });
      void queryClient.invalidateQueries({ queryKey: metricsKeys.all });
    },
  });
}
