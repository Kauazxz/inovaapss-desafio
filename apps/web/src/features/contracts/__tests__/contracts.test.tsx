import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  createFakeApi,
  type FakeApi,
  makeClient,
  makeContract,
  makePlan,
} from '@/features/clients/__tests__/fake-api';

import { ContractsPanel } from '../ContractsPanel';
import { PlansManager } from '../PlansManager';

import type { ReactNode } from 'react';

const auth = vi.hoisted(() => ({ role: 'analyst' as string | null }));

vi.mock('@/features/auth/use-auth', () => ({
  useAuth: () => ({ me: { role: auth.role }, user: null, session: null, status: 'signed_in' }),
}));

function renderWithQuery(ui: ReactNode) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>);
}

describe('PlansManager', () => {
  let api: FakeApi;

  beforeEach(() => {
    auth.role = 'analyst';
    api = createFakeApi({
      plans: [
        makePlan({ id: 'plan-basic', name: 'Básico', description: 'Suporte em horário comercial' }),
        makePlan({ id: 'plan-premium', name: 'Premium' }),
      ],
    });
    vi.stubGlobal('fetch', api.fetch);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('lista os planos em ordem alfabética', async () => {
    renderWithQuery(<PlansManager />);
    const table = await screen.findByRole('table');
    const names = within(table)
      .getAllByRole('row')
      .slice(1)
      .map((row) => within(row).getAllByRole('cell')[0]?.textContent);
    expect(names).toEqual(['Básico', 'Premium']);
    expect(screen.getByText('Suporte em horário comercial')).toBeInTheDocument();
  });

  it('cria um plano e trata nome repetido', async () => {
    const user = userEvent.setup();
    renderWithQuery(<PlansManager />);
    await screen.findByRole('table');

    await user.click(screen.getByRole('button', { name: 'Novo plano' }));
    const form = await screen.findByRole('form', { name: 'Novo plano' });
    await user.type(within(form).getByLabelText('Nome'), 'premium');
    await user.click(within(form).getByRole('button', { name: 'Criar plano' }));
    expect(await within(form).findByText('Já existe um plano com este nome.')).toBeInTheDocument();

    await user.clear(within(form).getByLabelText('Nome'));
    await user.type(within(form).getByLabelText('Nome'), 'Enterprise');
    await user.type(within(form).getByLabelText('Descrição'), 'Gerente dedicado');
    await user.click(within(form).getByRole('button', { name: 'Criar plano' }));

    await waitFor(() => expect(api.writes()).toHaveLength(2));
    expect(api.writes()[1]).toMatchObject({
      method: 'POST',
      url: '/api/v1/plans',
      body: { name: 'Enterprise', description: 'Gerente dedicado' },
    });
    expect(await screen.findByText('Enterprise')).toBeInTheDocument();
  });

  it('edita um plano', async () => {
    const user = userEvent.setup();
    renderWithQuery(<PlansManager />);
    await screen.findByRole('table');

    await user.click(screen.getByRole('button', { name: 'Editar Premium' }));
    const form = await screen.findByRole('form', { name: 'Editar plano' });
    expect(within(form).getByLabelText('Nome')).toHaveValue('Premium');
    await user.type(within(form).getByLabelText('Descrição'), 'Atendimento prioritário');
    await user.click(within(form).getByRole('button', { name: 'Salvar alterações' }));

    await waitFor(() => expect(api.writes()).toHaveLength(1));
    expect(api.writes()[0]).toMatchObject({
      method: 'PATCH',
      url: '/api/v1/plans/plan-premium',
      body: { name: 'Premium', description: 'Atendimento prioritário' },
    });
  });

  it('viewer só lê', async () => {
    auth.role = 'viewer';
    renderWithQuery(<PlansManager />);
    await screen.findByRole('table');
    expect(screen.queryByRole('button', { name: 'Novo plano' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Editar/ })).not.toBeInTheDocument();
  });
});

describe('ContractsPanel', () => {
  let api: FakeApi;

  beforeEach(() => {
    auth.role = 'analyst';
    api = createFakeApi({
      plans: [makePlan({ id: 'plan-premium', name: 'Premium' })],
      clients: [makeClient({ id: 'c1', name: 'Alfa Tech' })],
      contracts: [
        makeContract({
          id: 'k-old',
          portfolioClientId: 'c1',
          startDate: '2025-01-01',
          endDate: '2025-12-31',
          status: 'ended',
          monthlyValue: 800,
        }),
        makeContract({
          id: 'k-active',
          portfolioClientId: 'c1',
          planId: 'plan-premium',
          startDate: '2026-01-01',
          monthlyValue: 1500,
          contractedSlaHours: 24,
        }),
      ],
    });
    vi.stubGlobal('fetch', api.fetch);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('lista os contratos do cliente com o ativo em destaque', async () => {
    renderWithQuery(<ContractsPanel clientId="c1" />);
    const table = await screen.findByRole('table');
    expect(screen.getByText(/Contrato ativo: Premium/)).toBeInTheDocument();
    const dataRows = within(table).getAllByRole('row').slice(1);
    expect(dataRows).toHaveLength(2);
    expect(within(dataRows[0]!).getByText('Premium')).toBeInTheDocument();
    expect(within(dataRows[0]!).getByText('01/01/2026')).toBeInTheDocument();
    expect(within(dataRows[0]!).getByText('24')).toBeInTheDocument();
    expect(within(dataRows[1]!).getByText('Encerrado')).toBeInTheDocument();
    expect(within(dataRows[1]!).getByText('31/12/2025')).toBeInTheDocument();
    // Só o ativo pode ser encerrado.
    expect(screen.getAllByRole('button', { name: /Encerrar contrato/ })).toHaveLength(1);
    const listUrl = api.fetch.mock.calls
      .map(([input]) => String(input))
      .find((url) => url.includes('/api/v1/contracts?'));
    expect(listUrl).toContain('clientId=c1');
  });

  it('cria um contrato novo (a API encerra o anterior) e valida o valor', async () => {
    const user = userEvent.setup();
    renderWithQuery(<ContractsPanel clientId="c1" />);
    await screen.findByRole('table');

    await user.click(screen.getByRole('button', { name: 'Novo contrato' }));
    const form = await screen.findByRole('form', { name: 'Novo contrato' });
    expect(
      screen.getByText(/O contrato ativo atual \(Premium\) será encerrado/),
    ).toBeInTheDocument();

    await user.click(within(form).getByRole('button', { name: 'Criar contrato' }));
    expect(await within(form).findByText('Informe o valor mensal.')).toBeInTheDocument();
    expect(api.writes()).toHaveLength(0);

    await user.selectOptions(within(form).getByLabelText('Plano'), 'Premium');
    await user.type(within(form).getByLabelText('Valor mensal'), '2500.5');
    await user.clear(within(form).getByLabelText('Início'));
    await user.type(within(form).getByLabelText('Início'), '2026-06-01');
    await user.type(within(form).getByLabelText('SLA contratado (horas)'), '8');
    await user.click(within(form).getByRole('button', { name: 'Criar contrato' }));

    await waitFor(() => expect(api.writes()).toHaveLength(1));
    expect(api.writes()[0]).toMatchObject({
      method: 'POST',
      url: '/api/v1/contracts',
      body: {
        portfolioClientId: 'c1',
        planId: 'plan-premium',
        monthlyValue: 2500.5,
        currency: 'BRL',
        startDate: '2026-06-01',
        endDate: null,
        status: 'active',
        contractedSlaHours: 8,
      },
    });
    await waitFor(() => {
      const table = screen.getByRole('table');
      expect(within(table).getAllByRole('row').slice(1)).toHaveLength(3);
    });
    expect(api.store.contracts.find((c) => c.id === 'k-active')).toMatchObject({
      status: 'ended',
      endDate: '2026-06-01',
    });
  });

  it('encerra o contrato ativo com a data escolhida', async () => {
    const user = userEvent.setup();
    renderWithQuery(<ContractsPanel clientId="c1" />);
    await screen.findByRole('table');

    await user.click(screen.getByRole('button', { name: 'Encerrar contrato Premium' }));
    const heading = await screen.findByRole('heading', { name: 'Encerrar contrato' });
    expect(heading).toBeInTheDocument();
    const dateInput = screen.getByLabelText('Data de término');
    await user.clear(dateInput);
    await user.type(dateInput, '2025-06-01');
    await user.click(screen.getByRole('button', { name: 'Encerrar contrato' }));
    expect(await screen.findByText(/não pode ser anterior ao início/)).toBeInTheDocument();
    expect(api.writes()).toHaveLength(0);

    await user.clear(dateInput);
    await user.type(dateInput, '2026-09-19');
    await user.click(screen.getByRole('button', { name: 'Encerrar contrato' }));
    await waitFor(() => expect(api.writes()).toHaveLength(1));
    expect(api.writes()[0]).toMatchObject({
      method: 'PATCH',
      url: '/api/v1/contracts/k-active',
      body: { status: 'ended', endDate: '2026-09-19' },
    });
    expect(await screen.findByText('Sem contrato ativo no momento.')).toBeInTheDocument();
  });

  it('mostra o estado vazio quando o cliente não tem contratos', async () => {
    vi.stubGlobal(
      'fetch',
      createFakeApi({ clients: [makeClient({ id: 'c9', name: 'Sem' })] }).fetch,
    );
    renderWithQuery(<ContractsPanel clientId="c9" />);
    expect(await screen.findByRole('heading', { name: 'Nenhum contrato' })).toBeInTheDocument();
  });
});
