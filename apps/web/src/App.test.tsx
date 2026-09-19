import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { describe, expect, it } from 'vitest';

import { App } from './App';

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <App />
    </MemoryRouter>,
  );
}

describe('App', () => {
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

  it('mostra as abas "Em risco" e "Geral" em /dashboard', async () => {
    renderAt('/dashboard');

    expect(screen.getByRole('tab', { name: 'Em risco' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Geral' })).toBeInTheDocument();
    // O gráfico carrega num chunk separado (lazy): espera ele aparecer. O timeout é folgado
    // porque, no turbo, os testes dos pacotes rodam em paralelo e o primeiro import demora mais.
    expect(
      await screen.findByRole('button', { name: 'Ver como tabela' }, { timeout: 15_000 }),
    ).toBeInTheDocument();
  });

  it('redireciona / para /dashboard', () => {
    renderAt('/');

    expect(screen.getByRole('tab', { name: 'Em risco' })).toBeInTheDocument();
  });
});
