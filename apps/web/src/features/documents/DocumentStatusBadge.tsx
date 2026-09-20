import type { DocumentStatus, MetricSuggestionStatus } from '@inovaapss/validation';

import { Badge } from '@/components/ui/badge';

import { DOCUMENT_STATUS_LABELS, SUGGESTION_STATUS_LABELS } from './format';

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
