import { Upload } from 'lucide-react';

import { PlaceholderPage } from '@/components/placeholder-page';

/** §38 /import — importador de dados (§34 + A4: XLSX, CSV e JSON). Entra na Etapa 7. */
export function ImportPage() {
  return (
    <PlaceholderPage
      title="Importar dados"
      description="Planilhas e arquivos de chamados, uso, pagamentos e reuniões entram por aqui."
      icon={Upload}
      emptyTitle="Nenhuma importação ainda"
      emptyDescription="Upload de XLSX, CSV ou JSON, mapeamento de colunas, prévia, validação e relatório de erros chegam na Etapa 7."
    />
  );
}
