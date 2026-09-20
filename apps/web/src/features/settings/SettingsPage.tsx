import { PageHeader } from '@/components/page-header';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

import { OrganizationTab } from './OrganizationTab';
import { PlansTab } from './PlansTab';
import { UsersTab } from './UsersTab';

/**
 * §38 /settings — organização, usuários e papéis (§4, §5) e, na aba "Planos", os níveis de
 * atendimento dos contratos (Etapa 2) com quanto cada um é usado na carteira.
 */
export function SettingsPage() {
  return (
    <>
      <PageHeader
        title="Configurações"
        description="Dados da organização, quem tem acesso e com qual papel, e os planos da carteira."
      />
      <Tabs defaultValue="usuarios">
        {/* No celular a faixa de abas rola sozinha em vez de estourar a página; o padding em
            volta deixa passar o sublinhado da aba ativa e o anel de foco. */}
        <div className="-mx-1 overflow-x-auto px-1 pb-1.5">
          <TabsList variant="line" aria-label="Seções das configurações">
            <TabsTrigger value="usuarios">Usuários</TabsTrigger>
            <TabsTrigger value="planos">Planos</TabsTrigger>
            <TabsTrigger value="organizacao">Organização</TabsTrigger>
          </TabsList>
        </div>
        <TabsContent value="usuarios" className="pt-4">
          <UsersTab />
        </TabsContent>
        <TabsContent value="planos" className="pt-4">
          <PlansTab />
        </TabsContent>
        <TabsContent value="organizacao" className="pt-4">
          <OrganizationTab />
        </TabsContent>
      </Tabs>
    </>
  );
}
