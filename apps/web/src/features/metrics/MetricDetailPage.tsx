import { Gauge } from 'lucide-react';
import { useParams } from 'react-router';

import { PlaceholderPage } from '@/components/placeholder-page';

/** §38 /metrics/:id — detalhe de uma métrica. Entra na Etapa 3. */
export function MetricDetailPage() {
  const { id } = useParams();

  return (
    <PlaceholderPage
      title="Métrica"
      description={`Definição, normalização e histórico da métrica ${id ?? ''}.`}
      icon={Gauge}
      emptyTitle="O detalhe da métrica chega na Etapa 3"
      emptyDescription="Aqui entram tipo, direção, fonte, estratégia de normalização, thresholds e gatilhos críticos."
    />
  );
}
