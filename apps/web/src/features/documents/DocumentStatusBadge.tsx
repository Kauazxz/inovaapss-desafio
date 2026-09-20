import type { DocumentOrigin, DocumentStatus, MetricSuggestionStatus } from '@inovaapss/validation';

import { Badge } from '@/components/ui/badge';

import {
  DOCUMENT_ORIGIN_DESCRIPTIONS,
  DOCUMENT_ORIGIN_LABELS,
  DOCUMENT_STATUS_LABELS,
  SUGGESTION_STATUS_LABELS,
} from './format';

/**
 * Status sempre com o nome escrito; a variante só reforça (DATAVIZ.md §1.4). O azul é a cor de
 * ação (UI.md §1), então nenhum selo de status o usa: sobra o cinza e, só na falha, o vermelho.
 */
export function DocumentStatusBadge({ status }: { status: DocumentStatus }) {
  const variant =
    status === 'failed' ? 'destructive' : status === 'extracted' ? 'secondary' : 'outline';
  return <Badge variant={variant}>{DOCUMENT_STATUS_LABELS[status]}</Badge>;
}

/** Rejeitar é decisão de quem revisou, não erro: o selo fica quieto em vez de vermelho. */
export function SuggestionStatusBadge({ status }: { status: MetricSuggestionStatus }) {
  return (
    <Badge
      variant={status === 'accepted' ? 'secondary' : 'outline'}
      className={status === 'rejected' ? 'text-muted-foreground' : undefined}
    >
      {SUGGESTION_STATUS_LABELS[status]}
    </Badge>
  );
}

/** Procedência do arquivo: enviado nesta tela ou vindo da importação de dados (§34). */
export function DocumentOriginBadge({ origin }: { origin: DocumentOrigin }) {
  return (
    <Badge
      variant={origin === 'import' ? 'secondary' : 'outline'}
      title={DOCUMENT_ORIGIN_DESCRIPTIONS[origin]}
    >
      {DOCUMENT_ORIGIN_LABELS[origin]}
    </Badge>
  );
}
