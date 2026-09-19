import { UserSearch } from 'lucide-react';
import { useParams } from 'react-router';

import { PlaceholderPage } from '@/components/placeholder-page';

/** §38 /clients/:id — visão individual (§40). Entra na Etapa 9. */
export function ClientDetailPage() {
  const { id } = useParams();

  return (
    <PlaceholderPage
      title="Cliente"
      description={`Score, classe, tendência, confiança, principais motivos e ação sugerida do cliente ${id ?? ''}.`}
      icon={UserSearch}
      emptyTitle="A visão individual chega na Etapa 9"
      emptyDescription="Aqui entram o cabeçalho com Health, Risk e Confiança, os 10 scores de métrica em barras, a evolução por dimensão, evidências, recomendações e a timeline."
    />
  );
}
