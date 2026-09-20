import type { DocumentOrigin, DocumentStatus, MetricSuggestionStatus } from '@inovaapss/validation';

import { Badge } from '@/components/ui/badge';

import {
  DOCUMENT_ORIGIN_DESCRIPTIONS,
  DOCUMENT_ORIGIN_LABELS,
  DOCUMENT_STATUS_LABELS,
  SUGGESTION_STATUS_LABELS,
} from './format';

/** Status sempre com o nome escrito; a variante só reforça (DATAVIZ.md §1.4). */
export function DocumentStatusBadge({ status }: { status: DocumentStatus }) {
  const variant =
    status === 'failed' ? 'destructive' : status === 'extracted' ? 'default' : 'outline';
  return <Badge variant={variant}>{DOCUMENT_STATUS_LABELS[status]}</Badge>;
}

export function SuggestionStatusBadge({ status }: { status: MetricSuggestionStatus }) {
  const variant =
    status === 'rejected' ? 'destructive' : status === 'accepted' ? 'default' : 'outline';
  return <Badge variant={variant}>{SUGGESTION_STATUS_LABELS[status]}</Badge>;
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
