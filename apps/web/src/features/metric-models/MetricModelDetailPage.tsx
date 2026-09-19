import { SlidersHorizontal } from 'lucide-react';
import { useParams } from 'react-router';

import { PlaceholderPage } from '@/components/placeholder-page';

/** §38 /metric-models/:id — editor de um modelo (§41). Entra na Etapa 10. */
export function MetricModelDetailPage() {
  const { id } = useParams();

  return (
    <PlaceholderPage
      title="Modelo de métricas"
      description={`Pesos, thresholds e versões do modelo ${id ?? ''}.`}
      icon={SlidersHorizontal}
      emptyTitle="O editor do modelo chega na Etapa 10"
      emptyDescription="Tabela editável de pesos com a soma em texto (nunca medidor circular), preview do cálculo e histórico de versões."
    />
  );
}
