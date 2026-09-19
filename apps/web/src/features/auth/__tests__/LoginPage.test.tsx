import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { AuthProvider } from '../AuthProvider';
import { LoginPage } from '../LoginPage';
import { createFakeSupabase, type FakeSupabase } from './fake-supabase';

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
            <Route path="/dashboard" element={<h1>Dashboard</h1>} />
            <Route path="/clients" element={<h1>Clientes</h1>} />
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

  it('tem o link "Esqueci a senha"', () => {
    renderLogin();
    expect(screen.getByRole('link', { name: 'Esqueci a senha' })).toHaveAttribute(
      'href',
      '/forgot-password',
    );
  });
});
