import { PRIORITY_CLASS_LABELS, type HealthClass, type PriorityClass } from '@inovaapss/shared';

import { cn } from '@/lib/utils';

import { HEALTH_STATUS_LABELS } from './health-labels';

/** Cor da classe vem dos tokens do index.css (mesmos valores de chart-theme.ts). */
const CLASS_DOT: Readonly<Record<HealthClass, string>> = {
  NORMAL: 'bg-class-normal',
  ATTENTION: 'bg-class-attention',
  RISK: 'bg-class-risk',
  CRITICAL: 'bg-class-critical',
};

/** Pílula da classe de saúde: cor + nome escrito, nunca a cor sozinha (DATAVIZ.md §1.4). */
export function HealthPill({
  healthClass,
  className,
}: {
  healthClass: HealthClass;
  className?: string;
}) {
  return (
    <span
      className={cn(
        'inline-flex h-5 shrink-0 items-center gap-1.5 rounded-full border border-border px-2 text-xs font-medium whitespace-nowrap',
        className,
      )}
    >
      <span
        aria-hidden="true"
        className={cn('size-2 shrink-0 rounded-full', CLASS_DOT[healthClass])}
      />
      {HEALTH_STATUS_LABELS[healthClass]}
    </span>
  );
}

/** Pílula da classe de prioridade (§28), em cinza: prioridade não é saúde. */
export function PriorityPill({
  priorityClass,
  className,
}: {
  priorityClass: PriorityClass;
  className?: string;
}) {
  return (
    <span
      className={cn(
        'inline-flex h-5 shrink-0 items-center rounded-full bg-secondary px-2 text-xs font-medium whitespace-nowrap text-secondary-foreground',
        className,
      )}
    >
      {PRIORITY_CLASS_LABELS[priorityClass]}
    </span>
  );
}
