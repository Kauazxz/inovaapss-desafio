import { Outlet } from 'react-router';

/**
 * Guarda das rotas privadas (§38).
 *
 * TODO (Etapa 1 — feat(auth)): ler a sessão do Supabase (`getSupabaseClient().auth`),
 * mostrar um Skeleton enquanto carrega e redirecionar para /login (guardando a rota de
 * origem em `state.from`) quando não houver sessão. Por enquanto deixa passar para as
 * telas poderem ser construídas com mock.
 */
export function RequireAuth() {
  return <Outlet />;
}
