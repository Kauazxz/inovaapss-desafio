import { CircleAlert, Gauge, RefreshCw, SearchX } from 'lucide-react';

import { EmptyState } from '@/components/empty-state';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';

/** Carregamento inicial (§57): só na primeira carga; recargas mantêm o conteúdo anterior. */
export function MetricsLoading({ label }: { label: string }) {
  return (
    // O esqueleto nasce na mesma superfície elevada em que o conteúdo vai aparecer.
    <div
      role="status"
      aria-label={label}
      className="space-y-3 rounded-xl bg-card p-5 shadow-soft ring-1 ring-foreground/5"
    >
      <Skeleton className="h-8 w-full" />
      <Skeleton className="h-8 w-full" />
      <Skeleton className="h-8 w-3/4" />
    </div>
  );
}

/**
 * Erro com o motivo e um botão para tentar de novo (§57). Painel elevado, não caixa tracejada: a
 * borda tracejada é do estado vazio. O motivo vem escrito, em `text-destructive` — nunca só cor.
 */
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
    <section
      aria-live="polite"
      className="flex flex-col items-start gap-4 rounded-xl bg-card p-5 shadow-soft ring-1 ring-foreground/5 sm:flex-row sm:items-center sm:justify-between"
    >
      <div className="flex min-w-0 items-start gap-3">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-destructive/10 text-destructive">
          <CircleAlert className="size-5" aria-hidden="true" />
        </span>
        <div className="min-w-0">
          <h3 className="text-base font-medium text-destructive">{title}</h3>
          <p className="mt-1 text-sm break-words text-muted-foreground">{message}</p>
        </div>
      </div>
      <Button type="button" variant="outline" className="w-full sm:w-auto" onClick={onRetry}>
        <RefreshCw aria-hidden="true" />
        Tentar de novo
      </Button>
    </section>
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
