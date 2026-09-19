import { Bell } from 'lucide-react';

import { PlaceholderPage } from '@/components/placeholder-page';

/** §38 /alerts — gatilhos críticos e alertas (§27). Entra na Etapa 6. */
export function AlertsPage() {
  return (
    <PlaceholderPage
      title="Alertas"
      description="Gatilhos críticos disparados e o que fazer com cada um."
      icon={Bell}
      emptyTitle="Nenhum alerta"
      emptyDescription="Quando o motor de score rodar (Etapas 4 e 6), os gatilhos críticos aparecem aqui com a evidência e a ação sugerida."
    />
  );
}
