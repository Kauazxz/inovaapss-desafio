import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ForgotPasswordPage } from '../ForgotPasswordPage';
import { createFakeSupabase, type FakeSupabase } from './fake-supabase';

const supabase = vi.hoisted(() => ({ current: null as FakeSupabase | null }));

vi.mock('@/lib/supabase', () => ({
  getSupabaseClient: () => {
    if (!supabase.current) throw new Error('fake não configurado');
    return supabase.current.client;
  },
}));

describe('ForgotPasswordPage (§5 — recuperação de senha)', () => {
  beforeEach(() => {
    supabase.current = createFakeSupabase();
  });

  it('pede o link ao Supabase com redirectTo terminando em /login e responde de forma neutra', async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter initialEntries={['/forgot-password']}>
        <ForgotPasswordPage />
      </MemoryRouter>,
    );

    await user.type(screen.getByLabelText('E-mail'), 'ana@example.com');
    await user.click(screen.getByRole('button', { name: 'Enviar link' }));

    await waitFor(() => {
      expect(supabase.current?.auth.resetPasswordForEmail).toHaveBeenCalledWith('ana@example.com', {
        redirectTo: expect.stringMatching(/^https?:\/\/[^/]+\/login$/),
      });
    });
    // O link volta para /login, onde o evento PASSWORD_RECOVERY abre "Definir nova senha"
    // (LoginPage.test.tsx). A mensagem é a mesma exista o e-mail ou não.
    expect(await screen.findByRole('status')).toHaveTextContent(
      'Se ana@example.com estiver cadastrado, você receberá um link para redefinir a senha.',
    );
  });

  it('valida o e-mail antes de chamar o Supabase', async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter initialEntries={['/forgot-password']}>
        <ForgotPasswordPage />
      </MemoryRouter>,
    );

    await user.type(screen.getByLabelText('E-mail'), 'nao-e-email');
    await user.click(screen.getByRole('button', { name: 'Enviar link' }));

    expect(await screen.findByText('Informe um e-mail válido.')).toBeInTheDocument();
    expect(supabase.current?.auth.resetPasswordForEmail).not.toHaveBeenCalled();
  });
});
