import { Target } from 'lucide-react';

import { PlaceholderPage } from '@/components/placeholder-page';

/** §38 /calibration — backtest com histórico de cancelamentos (§33, §43). Entra na Etapa 12. */
export function CalibrationPage() {
  return (
    <PlaceholderPage
      title="Calibração"
      description="Compara o modelo com os cancelamentos reais e sugere novos pesos."
      icon={Target}
      emptyTitle="Sem histórico para calibrar"
      emptyDescription="Precision, recall, lead time, precision@5/10 e o slopegraph de pesos atual → sugerido chegam na Etapa 12, depois de dados importados."
    />
  );
}
