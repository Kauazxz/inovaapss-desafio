import { Search, X } from 'lucide-react';
import { useId, type ReactNode } from 'react';

import { PORTFOLIO_CLIENT_STATUSES, type PortfolioClientStatus } from '@inovaapss/validation';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

import { type ClientFilterOptions, type ClientFilters, isEmptyClientFilters } from './api';
import { CLIENT_STATUS_LABELS, STRATEGIC_IMPORTANCE_LABELS } from './labels';

export interface ClientsFilterBarProps {
  search: string;
  onSearchChange: (search: string) => void;
  filters: ClientFilters;
  onFiltersChange: (filters: ClientFilters) => void;
  options?: ClientFilterOptions | undefined;
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

/** Busca + filtros §61 (status, segmento, porte, plano, importância) numa linha só. */
export function ClientsFilterBar({
  search,
  onSearchChange,
  filters,
  onFiltersChange,
  options,
}: ClientsFilterBarProps) {
  const searchId = useId();
  const set = <K extends keyof ClientFilters>(key: K, value: ClientFilters[K]) =>
    onFiltersChange({ ...filters, [key]: value });
  const hasFilters = !isEmptyClientFilters(filters) || search !== '';

  return (
    <div role="group" aria-label="Filtros" className="flex flex-wrap items-end gap-2">
      <div className="relative min-w-52 flex-1 sm:flex-none">
        <label htmlFor={searchId} className="sr-only">
          Buscar por nome ou código
        </label>
        <Search
          aria-hidden="true"
          className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground"
        />
        <Input
          id={searchId}
          type="search"
          placeholder="Buscar por nome ou código"
          value={search}
          onChange={(event) => onSearchChange(event.target.value)}
          className="pl-8"
        />
      </div>

      <FilterSelect
        label="Status"
        allLabel="Ativos e inativos"
        value={filters.status ?? ''}
        onChange={(value) =>
          set('status', value === '' ? undefined : (value as PortfolioClientStatus))
        }
      >
        {PORTFOLIO_CLIENT_STATUSES.map((status) => (
          <option key={status} value={status}>
            {CLIENT_STATUS_LABELS[status]}
          </option>
        ))}
      </FilterSelect>

      <FilterSelect
        label="Segmento"
        allLabel="Todos os segmentos"
        value={filters.segment ?? ''}
        onChange={(value) => set('segment', value === '' ? undefined : value)}
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
        onChange={(value) => set('size', value === '' ? undefined : value)}
      >
        {options?.sizes.map((size) => (
          <option key={size} value={size}>
            {size}
          </option>
        ))}
      </FilterSelect>

      <FilterSelect
        label="Plano"
        allLabel="Todos os planos"
        value={filters.plan ?? ''}
        onChange={(value) => set('plan', value === '' ? undefined : value)}
      >
        {options?.plans.map((plan) => (
          <option key={plan} value={plan}>
            {plan}
          </option>
        ))}
      </FilterSelect>

      <FilterSelect
        label="Importância estratégica"
        allLabel="Qualquer importância"
        value={filters.strategicImportance === undefined ? '' : String(filters.strategicImportance)}
        onChange={(value) => set('strategicImportance', value === '' ? undefined : Number(value))}
      >
        {[1, 2, 3, 4, 5].map((value) => (
          <option key={value} value={value}>
            {STRATEGIC_IMPORTANCE_LABELS[value]}
          </option>
        ))}
      </FilterSelect>

      {hasFilters ? (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => {
            onFiltersChange({});
            onSearchChange('');
          }}
        >
          <X aria-hidden="true" />
          Limpar filtros
        </Button>
      ) : null}
    </div>
  );
}
