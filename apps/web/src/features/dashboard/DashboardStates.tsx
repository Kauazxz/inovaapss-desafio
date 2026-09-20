import { CircleAlert, Inbox, RefreshCw } from 'lucide-react';

import { EmptyState } from '@/components/empty-state';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { ImportDataButton } from '@/features/import/ImportDataButton';

/** Estado de carregamento inicial de uma aba (§57): só na primeira carga; recargas mantêm o anterior. */
export function DashboardLoading({ label }: { label: string }) {
  return (
    <div role="status" aria-label={label} className="space-y-8">
      <div className="grid grid-cols-2 gap-8 border-b border-border pb-6 md:grid-cols-4">
        {[0, 1, 2, 3].map((index) => (
          <div key={index} className="space-y-2">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-9 w-16" />
          </div>
        ))}
      </div>
      <Skeleton className="h-72 w-full" />
      <Skeleton className="h-48 w-full" />
    </div>
  );
}

/** Estado de erro com o motivo e um botão para tentar de novo. */
export function DashboardError({ error, onRetry }: { error: unknown; onRetry: () => void }) {
  const message = error instanceof Error ? error.message : 'Não foi possível carregar o dashboard.';
  return (
    <EmptyState
      icon={CircleAlert}
      title="Não foi possível carregar o dashboard"
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
