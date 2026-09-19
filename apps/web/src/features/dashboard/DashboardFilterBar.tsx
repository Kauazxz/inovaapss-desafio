import { Search, X } from 'lucide-react';
import { useId, type ReactNode } from 'react';

import {
  HEALTH_CLASS_LABELS,
  HEALTH_CLASSES,
  isEmptyDashboardFilters,
  PRIORITY_CLASS_LABELS,
  PRIORITY_CLASSES,
  type DashboardFilterOptions,
  type DashboardFilters,
  type HealthClass,
  type PriorityClass,
} from '@inovaapss/shared';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

export interface DashboardFilterBarProps {
  filters: DashboardFilters;
  onFiltersChange: (filters: DashboardFilters) => void;
  /** Valores de plano, segmento, porte e status vindos dos dados; sem eles os selects ficam vazios. */
  options?: DashboardFilterOptions | undefined;
  /** Busca por nome (só onde faz sentido — a aba "Em risco"). */
  search?: string | undefined;
  onSearchChange?: ((search: string) => void) | undefined;
  /** Controles extras no fim da linha (ex.: o seletor de cliente da evolução temporal). */
  children?: ReactNode | undefined;
}

const selectClassName =
  'h-8 rounded-lg border border-input bg-transparent px-2 text-sm outline-none transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30';

function FilterSelect({
  label,
  value,
  onChange,
  allLabel,
  children,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  allLabel: string;
  children: ReactNode;
}) {
  const id = useId();
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="sr-only">
        {label}
      </label>
      <select
        id={id}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className={cn(selectClassName, value === '' ? 'text-muted-foreground' : 'text-foreground')}
      >
        <option value="">{allLabel}</option>
        {children}
      </select>
    </div>
  );
}

/**
 * Uma linha de filtros (§61: health_class, priority_class, plan, segment, size, status) acima de
 * todos os gráficos da aba — todos respondem ao mesmo filtro (DATAVIZ.md §4.2).
 */
export function DashboardFilterBar({
  filters,
  onFiltersChange,
  options,
  search,
  onSearchChange,
  children,
}: DashboardFilterBarProps) {
  const searchId = useId();
  const set = <K extends keyof DashboardFilters>(key: K, value: string) =>
    onFiltersChange({ ...filters, [key]: value === '' ? undefined : value });
  const hasFilters = !isEmptyDashboardFilters(filters) || (search ?? '') !== '';

  return (
    <div role="group" aria-label="Filtros" className="flex flex-wrap items-end gap-2">
      {onSearchChange ? (
        <div className="relative min-w-52 flex-1 sm:flex-none">
          <label htmlFor={searchId} className="sr-only">
            Buscar cliente
          </label>
          <Search
            aria-hidden="true"
            className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground"
          />
          <Input
            id={searchId}
            type="search"
            placeholder="Buscar cliente"
            value={search ?? ''}
            onChange={(event) => onSearchChange(event.target.value)}
            className="pl-8"
          />
        </div>
      ) : null}

      <FilterSelect
        label="Classe de saúde"
        allLabel="Todas as classes"
        value={filters.healthClass ?? ''}
        onChange={(value) => set('healthClass', value as HealthClass | '')}
      >
        {HEALTH_CLASSES.map((healthClass) => (
          <option key={healthClass} value={healthClass}>
            {HEALTH_CLASS_LABELS[healthClass]}
          </option>
        ))}
      </FilterSelect>

      <FilterSelect
        label="Classe de prioridade"
        allLabel="Todas as prioridades"
        value={filters.priorityClass ?? ''}
        onChange={(value) => set('priorityClass', value as PriorityClass | '')}
      >
        {PRIORITY_CLASSES.map((priorityClass) => (
          <option key={priorityClass} value={priorityClass}>
            {PRIORITY_CLASS_LABELS[priorityClass]}
          </option>
        ))}
      </FilterSelect>

      <FilterSelect
        label="Plano"
        allLabel="Todos os planos"
        value={filters.plan ?? ''}
        onChange={(value) => set('plan', value)}
      >
        {options?.plans.map((plan) => (
          <option key={plan} value={plan}>
            {plan}
          </option>
        ))}
      </FilterSelect>

      <FilterSelect
        label="Segmento"
        allLabel="Todos os segmentos"
        value={filters.segment ?? ''}
        onChange={(value) => set('segment', value)}
      >
        {options?.segments.map((segment) => (
          <option key={segment} value={segment}>
            {segment}
          </option>
        ))}
      </FilterSelect>

      <FilterSelect
        label="Porte"
        allLabel="Todos os portes"
        value={filters.size ?? ''}
        onChange={(value) => set('size', value)}
      >
        {options?.sizes.map((size) => (
          <option key={size} value={size}>
            {size}
          </option>
        ))}
      </FilterSelect>

      <FilterSelect
        label="Status"
        allLabel="Todos os status"
        value={filters.status ?? ''}
        onChange={(value) => set('status', value)}
      >
        {options?.statuses.map((status) => (
          <option key={status} value={status}>
            {status}
          </option>
        ))}
      </FilterSelect>

      {children}

      {hasFilters ? (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => {
            onFiltersChange({});
            onSearchChange?.('');
          }}
        >
          <X aria-hidden="true" />
          Limpar filtros
        </Button>
      ) : null}
    </div>
  );
}
