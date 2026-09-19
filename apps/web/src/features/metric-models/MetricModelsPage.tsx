import { SlidersHorizontal } from 'lucide-react';

import { PlaceholderPage } from '@/components/placeholder-page';

/** §38 /metric-models — modelos de score e suas versões (§31). Entra na Etapa 10. */
export function MetricModelsPage() {
  return (
    <PlaceholderPage
      title="Modelos de métricas"
      description="Pesos, versões e simulação do modelo que calcula o health da carteira."
      icon={SlidersHorizontal}
      emptyTitle="Nenhum modelo configurado"
      emptyDescription="O configurador de pesos e thresholds, com versionamento e simulação, chega na Etapa 10."
    />
  );
}
