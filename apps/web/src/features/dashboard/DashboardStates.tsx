import { CircleAlert, Inbox, RefreshCw } from 'lucide-react';

import { EmptyState } from '@/components/empty-state';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { ImportDataButton } from '@/features/import/ImportDataButton';

/** Estado de carregamento inicial de uma aba (§57): só na primeira carga; recargas mantêm o anterior. */
export function DashboardLoading({ label }: { label: string }) {
  return (
    <div role="status" aria-label={label} className="space-y-6">
      {/* O esqueleto copia o desenho da tela: a linha de números e, abaixo, os dois blocos. */}
      <div className="grid grid-cols-2 gap-x-5 gap-y-5 border-b border-border pb-6 sm:gap-x-8 lg:grid-cols-4">
        {[0, 1, 2, 3].map((index) => (
          <div key={index} className="min-w-0 space-y-2">
            <Skeleton className="h-4 w-full max-w-24" />
            <Skeleton className="h-8 w-16" />
          </div>
        ))}
      </div>
      <Skeleton className="h-56 w-full rounded-xl sm:h-72" />
      <Skeleton className="h-40 w-full rounded-xl sm:h-48" />
    </div>
  );
}

/**
 * Estado de erro com o motivo e um botão para tentar de novo (§57). Painel elevado, não caixa
 * tracejada: a borda tracejada é do estado vazio. O motivo vem em `text-destructive`, nunca só cor.
 */
export function DashboardError({ error, onRetry }: { error: unknown; onRetry: () => void }) {
  const message = error instanceof Error ? error.message : 'Não foi possível carregar o dashboard.';
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
          <h3 className="text-base font-medium text-destructive">
            Não foi possível carregar o dashboard
          </h3>
          <p className="mt-1 text-sm text-muted-foreground">{message}</p>
        </div>
      </div>
      <Button type="button" variant="outline" onClick={onRetry} className="w-full sm:w-auto">
        <RefreshCw aria-hidden="true" />
        Tentar de novo
      </Button>
    </section>
  );
}

/** Estado vazio: sem clientes no recorte (com filtros) ou sem score ainda (sem filtros). */
export function DashboardEmpty({
  filtered,
  onClearFilters,
}: {
  filtered: boolean;
  onClearFilters?: () => void;
}) {
  if (filtered && onClearFilters) {
    return (
      <EmptyState
        icon={Inbox}
        title="Nenhum cliente corresponde aos filtros"
        description="Ajuste os filtros ou limpe todos para ver a carteira inteira."
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
      icon={Inbox}
      title="Ainda não há clientes com score"
      description="Importe os dados da carteira em Importar dados; o dashboard passa a mostrar quem está em risco assim que o primeiro cálculo terminar."
      action={<ImportDataButton variant="default" />}
    />
  );
}
