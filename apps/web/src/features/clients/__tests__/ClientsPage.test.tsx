import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ClientsPage } from '../ClientsPage';
import { createFakeApi, type FakeApi, makeClient, makeContract, makePlan } from './fake-api';

const auth = vi.hoisted(() => ({ role: 'admin' as string | null }));

vi.mock('@/features/auth/use-auth', () => ({
  useAuth: () => ({ me: { role: auth.role }, user: null, session: null, status: 'signed_in' }),
}));

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={['/clients']}>
        <Routes>
          <Route path="/clients" element={<ClientsPage />} />
          <Route path="/clients/:id" element={<p>Página do cliente</p>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

function rows(): HTMLElement[] {
  return Array.from(document.querySelectorAll<HTMLElement>('tbody tr[data-client-id]'));
}

function seededApi(): FakeApi {
  const premium = makePlan({ id: 'plan-premium', name: 'Premium' });
  return createFakeApi({
    plans: [premium],
    clients: [
      makeClient({
        id: 'c1',
        name: 'Alfa Tech',
        externalCode: 'CLI-001',
        segment: 'Varejo',
        size: 'PME',
      }),
      makeClient({
        id: 'c2',
        name: 'Beta Log',
        externalCode: 'CLI-002',
        segment: 'Logística',
        size: 'Grande',
      }),
      makeClient({ id: 'c3', name: 'Gama Saúde', externalCode: 'CLI-003', segment: 'Saúde' }),
    ],
    contracts: [
      makeContract({
        id: 'k1',
        portfolioClientId: 'c1',
        planId: 'plan-premium',
        monthlyValue: 1500,
      }),
      makeContract({ id: 'k2', portfolioClientId: 'c2', monthlyValue: 9000.5 }),
    ],
  });
}

describe('ClientsPage', () => {
  let api: FakeApi;

  beforeEach(() => {
    auth.role = 'admin';
    api = seededApi();
    vi.stubGlobal('fetch', api.fetch);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('mostra a tabela com nome, código, segmento, porte, plano, valor mensal e status', async () => {
    renderPage();
    expect(screen.getByRole('status', { name: 'Carregando clientes' })).toBeInTheDocument();

    await screen.findByRole('link', { name: 'Alfa Tech' });
    expect(rows()).toHaveLength(3);
    const alfa = rows()[0]!;
    expect(within(alfa).getByText('CLI-001')).toBeInTheDocument();
    expect(within(alfa).getByText('Varejo')).toBeInTheDocument();
    expect(within(alfa).getByText('PME')).toBeInTheDocument();
    expect(within(alfa).getByText('Premium')).toBeInTheDocument();
    expect(within(alfa).getByText(/1\.500,00/)).toBeInTheDocument();
    expect(within(alfa).getByText('Ativo')).toBeInTheDocument();
    // Sem contrato: célula honesta, não zero.
    const gama = rows()[2]!;
    expect(within(gama).getByText('sem contrato')).toBeInTheDocument();
    expect(screen.getByText('1–3 de 3 clientes')).toBeInTheDocument();
  });

  it('busca e filtra pela API (§61) e limpa os filtros no estado vazio', async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByRole('link', { name: 'Alfa Tech' });

    await user.type(screen.getByLabelText('Buscar por nome ou código'), 'gama');
    await waitFor(() => expect(rows()).toHaveLength(1));
    expect(screen.getByRole('link', { name: 'Gama Saúde' })).toBeInTheDocument();
    const lastList = api.fetch.mock.calls
      .map(([input]) => String(input))
      .filter((url) => url.includes('/api/v1/clients?'))
      .at(-1);
    expect(lastList).toContain('search=gama');

    await user.selectOptions(screen.getByLabelText('Plano'), 'Premium');
    const empty = (
      await screen.findByRole('heading', { name: 'Nenhum cliente corresponde à busca' })
    ).closest('section')!;
    // O CTA do estado vazio limpa busca e filtros (a barra tem o seu próprio botão).
    await user.click(within(empty).getByRole('button', { name: 'Limpar filtros' }));
    await waitFor(() => expect(rows()).toHaveLength(3));
    expect(screen.getByLabelText('Buscar por nome ou código')).toHaveValue('');
  });

  it('ordena pelo cabeçalho mandando sort/order para a API', async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByRole('link', { name: 'Alfa Tech' });

    await user.click(screen.getByRole('button', { name: 'Valor mensal' }));
    await waitFor(() => {
      const first = rows()[0]!;
      expect(within(first).getByRole('link')).toHaveTextContent('Beta Log');
    });
    const header = screen.getByRole('columnheader', { name: /Valor mensal/ });
    expect(header).toHaveAttribute('aria-sort', 'descending');
    const lastList = api.fetch.mock.calls
      .map(([input]) => String(input))
      .filter((url) => url.includes('/api/v1/clients?'))
      .at(-1);
    expect(lastList).toContain('sort=monthlyValue');
    expect(lastList).toContain('order=desc');
  });

  it('cadastra um cliente pelo diálogo com validação do schema compartilhado', async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByRole('link', { name: 'Alfa Tech' });

    await user.click(screen.getByRole('button', { name: 'Novo cliente' }));
    const form = await screen.findByRole('form', { name: 'Novo cliente' });
    await user.type(within(form).getByLabelText('Nome'), 'A');
    await user.click(within(form).getByRole('button', { name: 'Cadastrar cliente' }));
    expect(
      await within(form).findByText('O nome precisa ter pelo menos 2 caracteres.'),
    ).toBeInTheDocument();
    expect(api.writes()).toHaveLength(0);

    await user.clear(within(form).getByLabelText('Nome'));
    await user.type(within(form).getByLabelText('Nome'), 'Delta Nova');
    await user.type(within(form).getByLabelText('Código'), 'CLI-004');
    await user.selectOptions(within(form).getByLabelText('Importância estratégica'), '5');
    await user.click(within(form).getByRole('button', { name: 'Cadastrar cliente' }));

    await waitFor(() => expect(api.writes()).toHaveLength(1));
    expect(api.writes()[0]).toMatchObject({
      method: 'POST',
      url: '/api/v1/clients',
      body: {
        name: 'Delta Nova',
        externalCode: 'CLI-004',
        segment: null,
        size: null,
        status: 'active',
        strategicImportance: 5,
      },
    });
    expect(await screen.findByRole('link', { name: 'Delta Nova' })).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('Delta Nova cadastrado.');
  });

  it('mostra o erro de código repetido no campo', async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByRole('link', { name: 'Alfa Tech' });

    await user.click(screen.getByRole('button', { name: 'Novo cliente' }));
    const form = await screen.findByRole('form', { name: 'Novo cliente' });
    await user.type(within(form).getByLabelText('Nome'), 'Repetido');
    await user.type(within(form).getByLabelText('Código'), 'CLI-001');
    await user.click(within(form).getByRole('button', { name: 'Cadastrar cliente' }));
    expect(
      await within(form).findByText('Já existe um cliente com este código.'),
    ).toBeInTheDocument();
  });

  it('edita um cliente com PATCH', async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByRole('link', { name: 'Alfa Tech' });

    await user.click(screen.getByRole('button', { name: 'Editar Alfa Tech' }));
    const form = await screen.findByRole('form', { name: 'Editar cliente' });
    expect(within(form).getByLabelText('Nome')).toHaveValue('Alfa Tech');
    await user.clear(within(form).getByLabelText('Segmento'));
    await user.type(within(form).getByLabelText('Segmento'), 'Tecnologia');
    await user.click(within(form).getByRole('button', { name: 'Salvar alterações' }));

    await waitFor(() => expect(api.writes()).toHaveLength(1));
    expect(api.writes()[0]).toMatchObject({
      method: 'PATCH',
      url: '/api/v1/clients/c1',
      body: { segment: 'Tecnologia' },
    });
    await waitFor(() => {
      const alfa = rows().find((row) => row.dataset.clientId === 'c1')!;
      expect(within(alfa).getByText('Tecnologia')).toBeInTheDocument();
    });
  });

  it('arquiva com confirmação e o cliente some da lista', async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByRole('link', { name: 'Alfa Tech' });

    await user.click(screen.getByRole('button', { name: 'Arquivar Alfa Tech' }));
    expect(await screen.findByRole('heading', { name: 'Arquivar Alfa Tech?' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Arquivar cliente' }));

    await waitFor(() => expect(api.writes()).toHaveLength(1));
    expect(api.writes()[0]).toMatchObject({ method: 'DELETE', url: '/api/v1/clients/c1' });
    await waitFor(() => expect(rows()).toHaveLength(2));
    expect(screen.queryByRole('link', { name: 'Alfa Tech' })).not.toBeInTheDocument();
    expect(api.store.clients.find((c) => c.id === 'c1')?.status).toBe('archived');
  });

  it('viewer não vê botões de escrita', async () => {
    auth.role = 'viewer';
    renderPage();
    await screen.findByRole('link', { name: 'Alfa Tech' });
    expect(screen.queryByRole('button', { name: 'Novo cliente' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Editar Alfa Tech' })).not.toBeInTheDocument();
  });

  it('mostra o estado vazio e o de erro', async () => {
    vi.stubGlobal('fetch', createFakeApi().fetch);
    const { unmount } = renderPage();
    expect(
      await screen.findByRole('heading', { name: 'Nenhum cliente ainda' }),
    ).toBeInTheDocument();
    unmount();

    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new TypeError('rede fora');
      }),
    );
    renderPage();
    expect(
      await screen.findByRole('heading', { name: 'Não foi possível carregar os clientes' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Tentar de novo' })).toBeInTheDocument();
  });
});
