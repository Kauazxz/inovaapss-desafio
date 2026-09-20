import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router';
import { describe, expect, it, vi } from 'vitest';

import { NAV_ENTRIES } from '@/routes/nav';

import { PrivateLayout } from './PrivateLayout';

vi.mock('@/features/auth/use-auth', () => ({
  useAuth: () => ({
    me: { organization: { name: 'Empresa Exemplo' } },
    user: { email: 'pessoa@empresa.com' },
    signOut: vi.fn(),
  }),
}));

function renderLayout() {
  return render(
    <MemoryRouter initialEntries={['/dashboard']}>
      <Routes>
        <Route element={<PrivateLayout />}>
          <Route path="/dashboard" element={<p>Conteúdo da dashboard</p>} />
        </Route>
      </Routes>
    </MemoryRouter>,
  );
}

describe('PrivateLayout', () => {
  it('mantém a navegação em uma barra superior fixa', () => {
    renderLayout();

    const navigation = screen.getByRole('navigation', { name: 'Navegação principal' });
    expect(navigation.closest('header')).toHaveClass('sticky', 'top-0');
    expect(screen.queryByRole('complementary')).not.toBeInTheDocument();

    for (const entry of NAV_ENTRIES) {
      if (entry.kind === 'link') {
        expect(within(navigation).getByRole('link', { name: entry.label })).toHaveAttribute(
          'href',
          entry.to,
        );
      } else {
        expect(within(navigation).getByRole('button', { name: entry.label })).toBeInTheDocument();
      }
    }
    expect(screen.getByText('Conteúdo da dashboard')).toBeInTheDocument();
  });

  it('abre as telas agrupadas pelo submenu da entrada', async () => {
    const user = userEvent.setup();
    renderLayout();

    const navigation = screen.getByRole('navigation', { name: 'Navegação principal' });
    for (const entry of NAV_ENTRIES) {
      if (entry.kind !== 'group') continue;

      await user.click(within(navigation).getByRole('button', { name: entry.label }));
      const menu = await screen.findByRole('menu');
      for (const item of entry.items) {
        expect(
          within(menu).getByRole('menuitem', { name: new RegExp(item.label) }),
        ).toHaveAttribute('href', item.to);
      }
      await user.keyboard('{Escape}');
    }
  });

  it('guarda organização, configurações e saída no menu da conta', async () => {
    const user = userEvent.setup();
    renderLayout();

    await user.click(screen.getByRole('button', { name: 'Conta e organização' }));
    const menu = await screen.findByRole('menu');

    expect(within(menu).getByTestId('organization-name')).toHaveTextContent('Empresa Exemplo');
    expect(within(menu).getByText('pessoa@empresa.com')).toBeInTheDocument();
    expect(within(menu).getByRole('menuitem', { name: 'Configurações' })).toHaveAttribute(
      'href',
      '/settings',
    );
    expect(within(menu).getByRole('menuitem', { name: 'Sair' })).toBeInTheDocument();
  });
});
