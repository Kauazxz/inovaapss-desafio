import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { RequireAuth } from '@/routes/RequireAuth';

import { AuthProvider } from '../AuthProvider';
import { LoginPage } from '../LoginPage';
import { createFakeSupabase, type FakeSupabase, makeSession } from './fake-supabase';

const supabase = vi.hoisted(() => ({ current: null as FakeSupabase | null }));

vi.mock('@/lib/supabase', () => ({
  getSupabaseClient: () => {
    if (!supabase.current) throw new Error('fake não configurado');
    return supabase.current.client;
  },
}));

function renderLogin(initialPath = '/login', state?: { from: string }) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[{ pathname: initialPath, state }]}>
        <AuthProvider>
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route element={<RequireAuth />}>
              <Route path="/dashboard" element={<h1>Dashboard</h1>} />
              <Route path="/clients" element={<h1>Clientes</h1>} />
            </Route>
          </Routes>
        </AuthProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('LoginPage', () => {
  beforeEach(() => {
    supabase.current = createFakeSupabase();
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('{}', { status: 200 })),
    );
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('valida e-mail e senha antes de chamar o Supabase', async () => {
    const user = userEvent.setup();
    renderLogin();

    await user.type(screen.getByLabelText('E-mail'), 'nao-e-email');
    await user.type(screen.getByLabelText('Senha'), '123');
    await user.click(screen.getByRole('button', { name: 'Entrar' }));

    expect(await screen.findByText('Informe um e-mail válido.')).toBeInTheDocument();
    expect(screen.getByText('A senha tem pelo menos 6 caracteres.')).toBeInTheDocument();
    expect(supabase.current?.auth.signInWithPassword).not.toHaveBeenCalled();
  });

  it('entra com signInWithPassword e volta para a rota de origem', async () => {
    const user = userEvent.setup();
    renderLogin('/login', { from: '/clients' });

    await user.type(screen.getByLabelText('E-mail'), 'ana@example.com');
    await user.type(screen.getByLabelText('Senha'), 'segredo-123');
    await user.click(screen.getByRole('button', { name: 'Entrar' }));

    await waitFor(() => {
      expect(supabase.current?.auth.signInWithPassword).toHaveBeenCalledWith({
        email: 'ana@example.com',
        password: 'segredo-123',
      });
    });
    expect(await screen.findByRole('heading', { name: 'Clientes' })).toBeInTheDocument();
  });

  it('mostra erro amigável quando as credenciais são inválidas', async () => {
    supabase.current = createFakeSupabase({
      signInError: { code: 'invalid_credentials', message: 'Invalid login credentials' },
    });
    const user = userEvent.setup();
    renderLogin();

    await user.type(screen.getByLabelText('E-mail'), 'ana@example.com');
    await user.type(screen.getByLabelText('Senha'), 'errada-123');
    await user.click(screen.getByRole('button', { name: 'Entrar' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('E-mail ou senha incorretos.');
  });

  it('traduz falha de rede do Supabase (URL errada ou sem conexão) para português', async () => {
    supabase.current = createFakeSupabase({
      signInError: { message: 'Failed to fetch', status: 0 },
    });
    const user = userEvent.setup();
    renderLogin();

    await user.type(screen.getByLabelText('E-mail'), 'ana@example.com');
    await user.type(screen.getByLabelText('Senha'), 'segredo-123');
    await user.click(screen.getByRole('button', { name: 'Entrar' }));

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Não foi possível falar com o serviço de autenticação');
    expect(alert).toHaveTextContent('VITE_SUPABASE_URL');
    expect(alert).not.toHaveTextContent('Failed to fetch');
  });

  it('tem o link "Esqueci a senha"', () => {
    renderLogin();
    expect(screen.getByRole('link', { name: 'Esqueci a senha' })).toHaveAttribute(
      'href',
      '/forgot-password',
    );
  });

  describe('link de recuperação de senha (§5)', () => {
    async function fillNewPassword(password: string) {
      const user = userEvent.setup();
      expect(await screen.findByRole('form', { name: 'Definir nova senha' })).toBeInTheDocument();
      await user.type(screen.getByLabelText('Nova senha'), password);
      await user.type(screen.getByLabelText('Confirmar senha'), password);
      await user.click(screen.getByRole('button', { name: 'Salvar nova senha' }));
    }

    it('PASSWORD_RECOVERY em /login abre "Definir nova senha", salva com updateUser e vai para /dashboard', async () => {
      renderLogin();
      const session = makeSession('ana@example.com');
      await act(async () => {
        supabase.current?.emit('PASSWORD_RECOVERY', session);
      });

      await fillNewPassword('nova-senha-123');

      await waitFor(() => {
        expect(supabase.current?.auth.updateUser).toHaveBeenCalledWith({
          password: 'nova-senha-123',
        });
      });
      expect(await screen.findByRole('heading', { name: 'Dashboard' })).toBeInTheDocument();
      expect(screen.queryByRole('form', { name: 'Definir nova senha' })).not.toBeInTheDocument();
    });

    it('SIGNED_IN antes de PASSWORD_RECOVERY: o /login já redirecionou, e a rota privada mostra o formulário', async () => {
      renderLogin();
      const session = makeSession('ana@example.com');
      await act(async () => {
        supabase.current?.emit('SIGNED_IN', session);
      });
      expect(await screen.findByRole('heading', { name: 'Dashboard' })).toBeInTheDocument();

      await act(async () => {
        supabase.current?.emit('PASSWORD_RECOVERY', session);
      });
      await fillNewPassword('outra-senha-456');

      await waitFor(() => {
        expect(supabase.current?.auth.updateUser).toHaveBeenCalledWith({
          password: 'outra-senha-456',
        });
      });
      expect(await screen.findByRole('heading', { name: 'Dashboard' })).toBeInTheDocument();
    });

    it('não salva quando as senhas não conferem', async () => {
      renderLogin();
      const user = userEvent.setup();
      await act(async () => {
        supabase.current?.emit('PASSWORD_RECOVERY', makeSession('ana@example.com'));
      });
      await screen.findByRole('form', { name: 'Definir nova senha' });
      await user.type(screen.getByLabelText('Nova senha'), 'nova-senha-123');
      await user.type(screen.getByLabelText('Confirmar senha'), 'diferente-123');
      await user.click(screen.getByRole('button', { name: 'Salvar nova senha' }));

      expect(await screen.findByText('As senhas não conferem.')).toBeInTheDocument();
      expect(supabase.current?.auth.updateUser).not.toHaveBeenCalled();
    });
  });
});
