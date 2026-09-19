import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { AuthProvider } from '../AuthProvider';
import { OnboardingPage } from '../OnboardingPage';
import {
  createFakeSupabase,
  type FakeSupabase,
  jsonResponse,
  makeSession,
  meResponse,
} from './fake-supabase';

const supabase = vi.hoisted(() => ({ current: null as FakeSupabase | null }));

vi.mock('@/lib/supabase', () => ({
  getSupabaseClient: () => {
    if (!supabase.current) throw new Error('fake não configurado');
    return supabase.current.client;
  },
}));

function renderOnboarding() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={['/onboarding']}>
        <AuthProvider>
          <Routes>
            <Route path="/onboarding" element={<OnboardingPage />} />
            <Route path="/dashboard" element={<h1>Dashboard</h1>} />
          </Routes>
        </AuthProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('OnboardingPage', () => {
  const fetchMock = vi.fn<typeof fetch>();

  beforeEach(() => {
    supabase.current = createFakeSupabase({ session: makeSession('ana@example.com') });
    fetchMock.mockReset();
    fetchMock.mockImplementation(async (input, init) => {
      const url = String(input);
      if (url.endsWith('/api/v1/me')) {
        return jsonResponse(200, meResponse('ana@example.com', null));
      }
      if (url.endsWith('/api/v1/organizations') && init?.method === 'POST') {
        const body = JSON.parse(String(init.body)) as { name: string; slug: string };
        return jsonResponse(201, { organization: { ...body, id: 'org-1' }, role: 'owner' });
      }
      return jsonResponse(404, { error: { code: 'NOT_FOUND', message: url } });
    });
    vi.stubGlobal('fetch', fetchMock);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('valida o nome e o slug sem chamar a API', async () => {
    const user = userEvent.setup();
    renderOnboarding();

    const form = await screen.findByRole('form', { name: 'Criar organização' });
    expect(form).toBeInTheDocument();

    await user.type(screen.getByLabelText('Nome da organização'), 'A');
    await user.click(screen.getByRole('button', { name: 'Criar organização' }));

    expect(
      await screen.findByText('O nome precisa ter pelo menos 2 caracteres.'),
    ).toBeInTheDocument();
    const posts = fetchMock.mock.calls.filter(([, init]) => init?.method === 'POST');
    expect(posts).toHaveLength(0);
  });

  it('sugere o slug a partir do nome, envia o POST e vai para o dashboard', async () => {
    const user = userEvent.setup();
    renderOnboarding();

    await screen.findByRole('form', { name: 'Criar organização' });
    await user.type(screen.getByLabelText('Nome da organização'), 'GlobalSys Ltda.');
    expect(screen.getByLabelText('Identificador (slug)')).toHaveValue('globalsys-ltda');

    await user.click(screen.getByRole('button', { name: 'Criar organização' }));

    await waitFor(() => {
      const post = fetchMock.mock.calls.find(([, init]) => init?.method === 'POST');
      expect(post).toBeDefined();
      expect(JSON.parse(String(post?.[1]?.body))).toEqual({
        name: 'GlobalSys Ltda.',
        slug: 'globalsys-ltda',
      });
      expect(new Headers(post?.[1]?.headers).get('Authorization')).toBe(
        'Bearer token-ana@example.com',
      );
    });
    expect(await screen.findByRole('heading', { name: 'Dashboard' })).toBeInTheDocument();
  });
});
