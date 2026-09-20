import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { App } from './App';
import {
  createFakeSupabase,
  type FakeSupabase,
  jsonResponse,
  makeSession,
  meResponse,
} from './features/auth/__tests__/fake-supabase';

// As rotas privadas exigem sessão (RequireAuth) e organização (RequireOrganization):
// o client do Supabase e o GET /me são dublês aqui.
const supabase = vi.hoisted(() => ({ current: null as FakeSupabase | null }));

vi.mock('@/lib/supabase', () => ({
  getSupabaseClient: () => {
    if (!supabase.current) throw new Error('fake não configurado');
    return supabase.current.client;
  },
}));

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <App />
    </MemoryRouter>,
  );
}

function signedInWithOrganization() {
  supabase.current = createFakeSupabase({ session: makeSession('ana@example.com') });
  vi.stubGlobal(
    'fetch',
    vi.fn(async () =>
      jsonResponse(200, meResponse('ana@example.com', { name: 'GlobalSys', slug: 'globalsys' })),
    ),
  );
}

describe('App', () => {
  beforeEach(() => {
    supabase.current = createFakeSupabase({ session: null });
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('mostra o formulário de login em /login', () => {
    renderAt('/login');

    expect(screen.getByRole('form', { name: 'Entrar' })).toBeInTheDocument();
    expect(screen.getByLabelText('E-mail')).toBeInTheDocument();
    expect(screen.getByLabelText('Senha')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Entrar' })).toBeInTheDocument();
  });

  it('mostra o formulário de recuperação em /forgot-password', () => {
    renderAt('/forgot-password');

    expect(screen.getByRole('form', { name: 'Recuperar senha' })).toBeInTheDocument();
    expect(screen.getByLabelText('E-mail')).toBeInTheDocument();
  });

  it('sem sessão, /dashboard leva para o login', async () => {
    renderAt('/dashboard');
    expect(await screen.findByRole('form', { name: 'Entrar' })).toBeInTheDocument();
  });

  it('com sessão e organização, mostra as abas "Em risco" e "Geral" em /dashboard', async () => {
    signedInWithOrganization();
    renderAt('/dashboard');

    expect(await screen.findByRole('tab', { name: 'Em risco' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Geral' })).toBeInTheDocument();

    // Organização e e-mail ficam no menu da conta, no canto direito da barra.
    await userEvent.click(screen.getByRole('button', { name: 'Conta e organização' }));
    expect(screen.getByTestId('organization-name')).toHaveTextContent('GlobalSys');
    expect(screen.getByText('ana@example.com')).toBeInTheDocument();
    await userEvent.keyboard('{Escape}');

    // O gráfico carrega num chunk separado (lazy): espera ele aparecer. O timeout é folgado
    // porque, no turbo, os testes dos pacotes rodam em paralelo e o primeiro import demora mais.
    expect(
      await screen.findByRole('button', { name: 'Ver como tabela' }, { timeout: 15_000 }),
    ).toBeInTheDocument();
  });

  it('redireciona / para /dashboard', async () => {
    signedInWithOrganization();
    renderAt('/');

    expect(await screen.findByRole('tab', { name: 'Em risco' })).toBeInTheDocument();
  });
});
