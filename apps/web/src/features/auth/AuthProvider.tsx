/**
 * Sessão do Supabase Auth no React (§5, passos 1–2): lê a sessão guardada, escuta
 * `onAuthStateChange`, consulta GET /me quando há sessão e liga o token ao cliente HTTP.
 */
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useMemo, useState } from 'react';

import { ApiError, configureApiAuth } from '@/lib/api';
import { getSupabaseClient } from '@/lib/supabase';

import { fetchMe, ME_QUERY_KEY } from './api';
import { AuthContext, type AuthContextValue, type AuthStatus } from './auth-context';

import type { Session, SupabaseClient } from '@supabase/supabase-js';
import type { ReactNode } from 'react';

interface SessionState {
  status: AuthStatus;
  session: Session | null;
  configError: string | null;
}

function tryGetClient(): { client: SupabaseClient } | { error: string } {
  try {
    return { client: getSupabaseClient() };
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Supabase não configurado.' };
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  // Sem VITE_SUPABASE_* o estado já nasce 'unconfigured' (decidido uma vez, fora do efeito).
  const [state, setState] = useState<SessionState>(() => {
    const result = tryGetClient();
    return 'error' in result
      ? { status: 'unconfigured', session: null, configError: result.error }
      : { status: 'loading', session: null, configError: null };
  });
  const [passwordRecovery, setPasswordRecovery] = useState(false);

  useEffect(() => {
    const result = tryGetClient();
    if ('error' in result) return; // já está 'unconfigured'
    const { client } = result;
    let active = true;
    // Se um evento (SIGNED_IN, PASSWORD_RECOVERY...) chegar antes de o getSession() resolver,
    // ele traz a sessão mais nova: o resultado tardio do getSession() não pode sobrescrevê-lo.
    let sawEvent = false;

    void client.auth.getSession().then(({ data }) => {
      if (!active || sawEvent) return;
      setState({
        status: data.session ? 'signed_in' : 'signed_out',
        session: data.session,
        configError: null,
      });
    });

    const {
      data: { subscription },
    } = client.auth.onAuthStateChange((event, session) => {
      if (!active) return;
      sawEvent = true;
      if (event === 'PASSWORD_RECOVERY') setPasswordRecovery(true);
      setState({
        status: session ? 'signed_in' : 'signed_out',
        session,
        configError: null,
      });
      if (event === 'SIGNED_OUT') {
        queryClient.removeQueries({ queryKey: ME_QUERY_KEY });
        setPasswordRecovery(false);
      }
    });

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, [queryClient]);

  const signOut = useCallback(async () => {
    const result = tryGetClient();
    if ('client' in result) {
      await result.client.auth.signOut();
    }
    queryClient.removeQueries({ queryKey: ME_QUERY_KEY });
    setPasswordRecovery(false);
    setState((prev) =>
      prev.status === 'unconfigured'
        ? prev
        : { status: 'signed_out', session: null, configError: null },
    );
  }, [queryClient]);

  // Token da sessão para o apiFetch + reação ao 401 (sessão inválida → sai e volta ao /login).
  useEffect(() => {
    configureApiAuth({
      async getToken() {
        const result = tryGetClient();
        if ('error' in result) return null;
        const { data } = await result.client.auth.getSession();
        return data.session?.access_token ?? null;
      },
      onUnauthorized() {
        void signOut();
      },
    });
    return () => configureApiAuth(null);
  }, [signOut]);

  const meQuery = useQuery({
    queryKey: ME_QUERY_KEY,
    queryFn: fetchMe,
    enabled: state.status === 'signed_in',
    staleTime: 60_000,
    retry: (count, error) => !(error instanceof ApiError && error.status < 500) && count < 1,
  });

  const value = useMemo<AuthContextValue>(
    () => ({
      status: state.status,
      session: state.session,
      user: state.session?.user ?? null,
      configError: state.configError,
      passwordRecovery,
      me: meQuery.data ?? null,
      meStatus:
        state.status !== 'signed_in'
          ? 'idle'
          : meQuery.isPending
            ? 'loading'
            : meQuery.isError
              ? 'error'
              : 'ready',
      meError: meQuery.error ?? null,
      refetchMe: () => meQuery.refetch(),
      signOut,
      finishPasswordRecovery: () => setPasswordRecovery(false),
    }),
    [state, passwordRecovery, meQuery, signOut],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
