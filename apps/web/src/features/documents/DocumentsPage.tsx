import { FileText } from 'lucide-react';

import { PlaceholderPage } from '@/components/placeholder-page';

/** §38 /documents — documentos e descoberta de métricas (§35 + A4/A5). Entra na Etapa 11. */
export function DocumentsPage() {
  return (
    <PlaceholderPage
      title="Documentos"
      description="Contratos, relatórios e atas viram sugestões de métricas para o modelo."
      icon={FileText}
      emptyTitle="Nenhum documento enviado"
      emptyDescription="Upload de PDF, DOCX, XLSX, CSV, JSON, MD ou TXT com o fluxo manual de sugestões chega na Etapa 11. A revisão por IA fica para depois (ajuste A5)."
    />
  );
}
