import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  createFakeSupabase,
  type FakeSupabase,
  jsonResponse,
  makeSession,
  meResponse,
} from '@/features/auth/__tests__/fake-supabase';
import { AuthProvider } from '@/features/auth/AuthProvider';

import { RequireAuth } from './RequireAuth';
import { RequireOrganization } from './RequireOrganization';

const supabase = vi.hoisted(() => ({ current: null as FakeSupabase | null }));

vi.mock('@/lib/supabase', () => ({
  getSupabaseClient: () => {
    if (!supabase.current) throw new Error('fake não configurado');
    return supabase.current.client;
  },
}));

function LoginProbe() {
  const location = useLocation();
  const from = (location.state as { from?: string } | null)?.from;
  return <p>Login (de: {from ?? 'nenhum'})</p>;
}

function renderAt(path: string) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[path]}>
        <AuthProvider>
          <Routes>
            <Route path="/login" element={<LoginProbe />} />
            <Route element={<RequireAuth />}>
              <Route path="/onboarding" element={<p>Onboarding</p>} />
              <Route element={<RequireOrganization />}>
                <Route path="/clients" element={<p>Clientes</p>} />
              </Route>
            </Route>
          </Routes>
        </AuthProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('RequireAuth', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('redireciona para /login guardando o destino quando não há sessão', async () => {
    supabase.current = createFakeSupabase({ session: null });
    renderAt('/clients?tab=risco');
    expect(await screen.findByText('Login (de: /clients?tab=risco)')).toBeInTheDocument();
  });

  it('mostra o esqueleto enquanto a sessão carrega', () => {
    supabase.current = createFakeSupabase({ session: null });
    renderAt('/clients');
    expect(screen.getByLabelText('Carregando sessão')).toBeInTheDocument();
  });
});

describe('RequireOrganization', () => {
  beforeEach(() => {
    supabase.current = createFakeSupabase({ session: makeSession('ana@example.com') });
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('manda para /onboarding quando GET /me devolve organization null', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => jsonResponse(200, meResponse('ana@example.com', null))),
    );
    renderAt('/clients');
    expect(await screen.findByText('Onboarding')).toBeInTheDocument();
  });

  it('libera a rota quando há organização', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        jsonResponse(200, meResponse('ana@example.com', { name: 'Alfa', slug: 'alfa' })),
      ),
    );
    renderAt('/clients');
    expect(await screen.findByText('Clientes')).toBeInTheDocument();
  });

  it('num 401 da API encerra a sessão e volta para /login', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        jsonResponse(401, { error: { code: 'UNAUTHORIZED', message: 'Sessão inválida.' } }),
      ),
    );
    renderAt('/clients');
    expect(await screen.findByText(/^Login/)).toBeInTheDocument();
    expect(supabase.current?.auth.signOut).toHaveBeenCalled();
  });
});
