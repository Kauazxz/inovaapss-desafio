import { Settings } from 'lucide-react';

import { EmptyState } from '@/components/empty-state';
import { PageHeader } from '@/components/page-header';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { PlansManager } from '@/features/contracts';

/**
 * §38 /settings — organização, usuários e papéis (§4, §5) e, na aba "Planos", os níveis de
 * atendimento dos contratos (Etapa 2).
 */
export function SettingsPage() {
  return (
    <>
      <PageHeader
        title="Configurações"
        description="Organização, usuários, papéis, planos e faixas de classificação."
      />
      <Tabs defaultValue="geral">
        <TabsList variant="line" aria-label="Seções das configurações">
          <TabsTrigger value="geral">Geral</TabsTrigger>
          <TabsTrigger value="planos">Planos</TabsTrigger>
        </TabsList>
        <TabsContent value="geral" className="pt-4">
          <EmptyState
            icon={Settings}
            title="As configurações da organização chegam em breve"
            description="Dados da organização, convite de usuários com papel (owner, admin, analyst, viewer) e thresholds de Normal / Atenção / Risco / Crítico."
          />
        </TabsContent>
        <TabsContent value="planos" className="pt-4">
          <PlansManager />
        </TabsContent>
      </Tabs>
    </>
  );
}
