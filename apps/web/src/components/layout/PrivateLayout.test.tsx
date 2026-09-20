import { render, screen, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { describe, expect, it, vi } from 'vitest';

import { NAV_ITEMS } from '@/routes/nav';

import { PrivateLayout } from './PrivateLayout';

vi.mock('@/features/auth/use-auth', () => ({
  useAuth: () => ({
    me: { organization: { name: 'Empresa Exemplo' } },
    user: { email: 'pessoa@empresa.com' },
    signOut: vi.fn(),
  }),
}));

describe('PrivateLayout', () => {
  it('mantém toda a navegação em uma barra superior fixa', () => {
    render(
      <MemoryRouter initialEntries={['/dashboard']}>
        <Routes>
          <Route element={<PrivateLayout />}>
            <Route path="/dashboard" element={<p>Conteúdo da dashboard</p>} />
          </Route>
        </Routes>
      </MemoryRouter>,
    );

    const navigation = screen.getByRole('navigation', { name: 'Navegação principal' });
    expect(navigation.closest('header')).toHaveClass('sticky', 'top-0');
    expect(screen.queryByRole('complementary')).not.toBeInTheDocument();

    for (const item of NAV_ITEMS) {
      expect(within(navigation).getByRole('link', { name: item.label })).toHaveAttribute(
        'href',
        item.to,
      );
    }
    expect(screen.getByText('Conteúdo da dashboard')).toBeInTheDocument();
  });
});
