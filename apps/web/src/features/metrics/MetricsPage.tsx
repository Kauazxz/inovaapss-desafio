import { Gauge } from 'lucide-react';

import { PlaceholderPage } from '@/components/placeholder-page';

/** §38 /metrics — definições de métrica (§6). Entra na Etapa 3. */
export function MetricsPage() {
  return (
    <PlaceholderPage
      title="Métricas"
      description="Tudo é métrica: tipo, direção, fonte, normalização e thresholds de cada indicador."
      icon={Gauge}
      emptyTitle="Nenhuma métrica definida"
      emptyDescription="O preset GlobalSys v1 (10 métricas) e o editor de métricas chegam na Etapa 3."
    />
  );
}
