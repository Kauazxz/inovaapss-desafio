import {
  AlertTriangle,
  ArrowRightLeft,
  CircleCheck,
  FileInput,
  FileText,
  type LucideIcon,
  SlidersHorizontal,
  UserX,
} from 'lucide-react';

import {
  HEALTH_CLASS_LABELS,
  TIMELINE_EVENT_TYPE_LABELS,
  type ClientHealthOverview,
  type TimelineEventDto,
  type TimelineEventType,
} from '@inovaapss/shared';

import { HealthTimelineChart } from '@/components/charts/health-timeline-chart';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { classifyHealthWith } from '@/lib/chart-theme';
import { formatInteger } from '@/lib/format';
import { cn } from '@/lib/utils';

import { useClientHistory } from '../api';
import { formatLongDate, formatShortDate } from '../format';
import { SectionTitle } from '../SectionTitle';

const EVENT_ICON: Readonly<Record<TimelineEventType, LucideIcon>> = {
  CLASS_CHANGE: ArrowRightLeft,
  ALERT: AlertTriangle,
  IMPORT: FileInput,
  RECOMMENDATION_DONE: CircleCheck,
  MODEL_VERSION: SlidersHorizontal,
  CONTRACT: FileText,
  CANCELLATION: UserX,
};

function EventItem({
  event,
  thresholds,
}: {
  event: TimelineEventDto;
  thresholds: ClientHealthOverview['thresholds'];
}) {
  const Icon = EVENT_ICON[event.type];
  const emphasized = event.severity !== 'INFO';
  return (
    <li className="relative flex gap-3 pb-6 last:pb-0">
      <span
        className={cn(
          'mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full border border-border bg-background',
          emphasized && 'border-foreground',
        )}
        aria-hidden="true"
      >
        <Icon className="size-3.5" />
      </span>
      <div className="min-w-0 space-y-1">
        <div className="flex flex-wrap items-center gap-2">
          <p className={cn('text-sm', emphasized && 'font-medium')}>{event.title}</p>
          <Badge variant={event.severity === 'CRITICAL' ? 'destructive' : 'outline'}>
            {TIMELINE_EVENT_TYPE_LABELS[event.type]}
          </Badge>
        </div>
        <p className="text-xs text-muted-foreground">
          <time dateTime={event.occurredAt} title={formatLongDate(event.occurredAt)}>
            {formatShortDate(event.occurredAt)}
          </time>
          {event.healthAt !== null
            ? ` · health ${formatInteger(event.healthAt)}/100 — ${HEALTH_CLASS_LABELS[classifyHealthWith(event.healthAt, thresholds)]}`
            : ''}
          {event.metricName ? ` · ${event.metricName}` : ''}
        </p>
        {event.description ? (
          <p className="text-sm text-muted-foreground">{event.description}</p>
        ) : null}
      </div>
    </li>
  );
}

/**
 * Aba "Histórico" (§40): a linha do overall_health contra a média da carteira e a timeline de
 * eventos — mudanças de classe, alertas, importações, recomendações concluídas, versão do modelo.
 */
export function HistoryTab({ overview }: { overview: ClientHealthOverview }) {
  const history = useClientHistory(overview.client.id);
  if (history.isPending) {
    return (
      <div role="status" aria-label="Carregando a aba Histórico" className="space-y-6">
        <Skeleton className="h-5 w-72" />
        <Skeleton className="h-60 w-full" />
      </div>
    );
  }
  if (history.isError) {
    return (
      <p role="alert" className="text-sm text-destructive">
        Não foi possível carregar o histórico.
      </p>
    );
  }
  const data = history.data;

  return (
    <div className="space-y-10">
      <HealthTimelineChart
        timeline={{
          portfolio: data.portfolio,
          client: {
            clientId: data.clientId,
            clientName: overview.client.name,
            points: data.health,
          },
          clientOptions: [],
        }}
        thresholds={data.thresholds}
      />

      <section aria-labelledby="timeline-title" className="space-y-4">
        <SectionTitle
          id="timeline-title"
          hint="Do mais recente ao mais antigo; cada evento mostra o health do momento."
        >
          Linha do tempo
        </SectionTitle>
        {data.events.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Nenhum evento registrado para este cliente ainda.
          </p>
        ) : (
          <ol aria-label="Eventos do cliente" className="border-l border-border pl-0 [&>li]:-ml-3">
            {data.events.map((event) => (
              <EventItem key={event.id} event={event} thresholds={data.thresholds} />
            ))}
          </ol>
        )}
      </section>
    </div>
  );
}
