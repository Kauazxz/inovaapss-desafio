import { Settings } from 'lucide-react';

import { PlaceholderPage } from '@/components/placeholder-page';

/** §38 /settings — organização, usuários e papéis (§4, §5). Entra na Etapa 1. */
export function SettingsPage() {
  return (
    <PlaceholderPage
      title="Configurações"
      description="Organização, usuários, papéis e faixas de classificação."
      icon={Settings}
      emptyTitle="As configurações chegam na Etapa 1"
      emptyDescription="Dados da organização, convite de usuários com papel (owner, admin, analyst, viewer) e thresholds de Normal / Atenção / Risco / Crítico."
    />
  );
}
