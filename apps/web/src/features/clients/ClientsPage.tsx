import { Users } from 'lucide-react';

import { PlaceholderPage } from '@/components/placeholder-page';

/** §38 /clients — lista da carteira. Entra na Etapa 2. */
export function ClientsPage() {
  return (
    <PlaceholderPage
      title="Clientes"
      description="A carteira da organização: plano, contrato, valor mensal e saúde de cada cliente."
      icon={Users}
      emptyTitle="Nenhum cliente ainda"
      emptyDescription="Cadastre clientes ou importe uma planilha (XLSX, CSV ou JSON) para ver a carteira aqui. Cadastro e importação chegam nas Etapas 2 e 7."
    />
  );
}
