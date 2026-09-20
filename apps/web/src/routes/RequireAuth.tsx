import { Navigate, Outlet, useLocation } from 'react-router';

import { Skeleton } from '@/components/ui/skeleton';
import { ResetPasswordForm } from '@/features/auth/ResetPasswordForm';
import { useAuth } from '@/features/auth/use-auth';

/**
 * Guarda das rotas privadas (§38): sem sessão, manda para /login guardando a rota de origem em
 * `state.from` para voltar depois do login. Enquanto a sessão carrega, mostra um esqueleto.
 *
 * Recuperação de senha (§5): o link do e-mail traz uma sessão de recuperação. Se o Supabase
 * emitir SIGNED_IN antes de PASSWORD_RECOVERY, o /login já redirecionou para cá; por isso o
 * formulário "Definir nova senha" também é mostrado aqui, em qualquer rota privada, até a
 * pessoa salvar a nova senha — independentemente da ordem dos eventos.
 */
export function RequireAuth() {
  const { status, configError, passwordRecovery } = useAuth();
  const location = useLocation();

  if (status === 'loading') {
    return (
      <div className="p-6" aria-busy="true" aria-label="Carregando sessão">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="mt-4 h-40 w-full" />
      </div>
    );
  }

  if (status === 'unconfigured') {
    return (
      <main className="flex min-h-screen items-center justify-center p-6 text-center">
        <div className="max-w-md space-y-2">
          <h1 className="text-lg font-semibold">Autenticação não configurada</h1>
          <p className="text-sm text-muted-foreground">{configError}</p>
        </div>
      </main>
    );
  }

  if (status === 'signed_out') {
    const from = `${location.pathname}${location.search}`;
    return <Navigate to="/login" replace state={{ from }} />;
  }

  if (passwordRecovery) {
    return (
      <main className="flex min-h-screen items-center justify-center p-6">
        <div className="w-full max-w-md">
          <ResetPasswordForm />
        </div>
      </main>
    );
  }

  return <Outlet />;
}
