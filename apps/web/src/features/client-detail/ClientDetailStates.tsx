import { CircleAlert, RefreshCw, UserSearch } from 'lucide-react';
import { Link } from 'react-router';

import { EmptyState } from '@/components/empty-state';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';

import { ClientNotFoundError } from './api';

/** Carregamento inicial da tela (§57): cabeçalho + abas em esqueleto, só na primeira carga. */
export function ClientDetailLoading() {
  return (
    <div role="status" aria-label="Carregando o cliente" className="space-y-6">
      <Skeleton className="h-4 w-56" />
      <Skeleton className="h-8 w-80" />
      <div className="grid grid-cols-2 gap-6 border-b border-border pb-6 md:grid-cols-4">
        {[0, 1, 2, 3].map((index) => (
          <div key={index} className="space-y-2">
            <Skeleton className="h-4 w-20" />
            <Skeleton className="h-8 w-28" />
          </div>
        ))}
      </div>
      <Skeleton className="h-64 w-full" />
    </div>
  );
}

/** Carregamento de uma aba (o chunk com os gráficos chega separado). */
export function ClientTabLoading({ label }: { label: string }) {
  return (
    <div role="status" aria-label={label} className="space-y-4 pt-4">
      <Skeleton className="h-5 w-72" />
      <Skeleton className="h-56 w-full" />
    </div>
  );
}

/** Erro: cliente inexistente (estado vazio com o caminho de volta) ou falha de carga (tentar de novo). */
export function ClientDetailError({
  error,
  clientId,
  onRetry,
}: {
  error: unknown;
  clientId: string;
  onRetry: () => void;
}) {
  const notFound =
    error instanceof ClientNotFoundError ||
    (typeof error === 'object' && error !== null && (error as { status?: number }).status === 404);

  if (notFound) {
    return (
      <EmptyState
        icon={UserSearch}
        title="Cliente não encontrado"
        description={`Não há cliente com o identificador "${clientId}" nesta organização. Ele pode ter sido removido ou o link está incompleto.`}
        action={
          <Button asChild variant="outline">
            <Link to="/dashboard">Voltar para o dashboard</Link>
          </Button>
        }
      />
    );
  }
  const message =
    error instanceof Error ? error.message : 'Não foi possível carregar os dados do cliente.';
  return (
    <EmptyState
      icon={CircleAlert}
      title="Não foi possível carregar o cliente"
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
