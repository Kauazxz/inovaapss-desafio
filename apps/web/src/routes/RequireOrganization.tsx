import { Navigate, Outlet } from 'react-router';

import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useAuth } from '@/features/auth/use-auth';

/**
 * Segunda guarda (§4): usuário logado precisa de uma organização para ver as telas privadas.
 * Sem organização (GET /me → organization null) vai para /onboarding. Roda depois de RequireAuth.
 */
export function RequireOrganization() {
  const { me, meStatus, meError, refetchMe, signOut } = useAuth();

  if (meStatus === 'idle' || meStatus === 'loading') {
    return (
      <div className="p-6" aria-busy="true" aria-label="Carregando organização">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="mt-4 h-40 w-full" />
      </div>
    );
  }

  if (meStatus === 'error') {
    return (
      <main className="flex min-h-screen items-center justify-center p-6 text-center">
        <div className="max-w-md space-y-3">
          <h1 className="text-lg font-semibold">Não foi possível carregar sua organização</h1>
          <p className="text-sm text-muted-foreground">{meError?.message}</p>
          <div className="flex justify-center gap-2">
            <Button onClick={() => void refetchMe()}>Tentar de novo</Button>
            <Button variant="outline" onClick={() => void signOut()}>
              Sair
            </Button>
          </div>
        </div>
      </main>
    );
  }

  if (!me?.organization) {
    return <Navigate to="/onboarding" replace />;
  }

  return <Outlet />;
}
