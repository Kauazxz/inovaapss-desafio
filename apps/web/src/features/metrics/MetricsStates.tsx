import { CircleAlert, Gauge, RefreshCw, SearchX } from 'lucide-react';

import { EmptyState } from '@/components/empty-state';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';

/** Carregamento inicial (§57): só na primeira carga; recargas mantêm o conteúdo anterior. */
export function MetricsLoading({ label }: { label: string }) {
  return (
    <div role="status" aria-label={label} className="space-y-3">
      <Skeleton className="h-8 w-full" />
      <Skeleton className="h-8 w-full" />
      <Skeleton className="h-8 w-3/4" />
    </div>
  );
}

export function MetricsError({
  title,
  error,
  onRetry,
}: {
  title: string;
  error: unknown;
  onRetry: () => void;
}) {
  const message = error instanceof Error ? error.message : 'Tente de novo em instantes.';
  return (
    <EmptyState
      icon={CircleAlert}
      title={title}
      description={message}
      action={
        <Button type="button" variant="outline" onClick={onRetry}>
          <RefreshCw aria-hidden="true" />
          Tentar de novo
        </Button>
      }
    />
  );
}

/** Vazio: sem métricas na organização, ou nenhuma no recorte dos filtros. */
export function MetricsEmpty({
  filtered,
  onClearFilters,
}: {
  filtered: boolean;
  onClearFilters: () => void;
}) {
  if (filtered) {
    return (
      <EmptyState
        icon={SearchX}
        title="Nenhuma métrica corresponde aos filtros"
        description="Ajuste a busca ou limpe os filtros para ver todas as métricas."
        action={
          <Button type="button" variant="outline" onClick={onClearFilters}>
            Limpar filtros
          </Button>
        }
      />
    );
  }
  return (
    <EmptyState
      icon={Gauge}
      title="Nenhuma métrica definida"
      description="Use “Nova métrica” para cadastrar a primeira, ou carregue o preset GlobalSys v1. Peso e normalização entram depois, no modelo de métricas."
    />
  );
}
