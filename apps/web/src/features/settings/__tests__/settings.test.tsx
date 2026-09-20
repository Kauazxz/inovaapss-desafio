import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { parseEmails, summarizePlanUsage } from '../api';
import { SettingsPage } from '../SettingsPage';
import {
  createFakeSettingsApi,
  type FakeSettingsApi,
  makeContract,
  makeMember,
  makePlan,
} from './fake-api';

import type { ReactNode } from 'react';

const auth = vi.hoisted(() => ({
  role: 'owner' as string | null,
  userId: 'user-owner' as string,
}));

vi.mock('@/features/auth/use-auth', () => ({
  useAuth: () => ({
    me: { role: auth.role, user: { id: auth.userId, email: 'ana@globalsys.com' } },
    user: null,
    session: null,
    status: 'signed_in',
  }),
}));

function renderPage(ui: ReactNode = <SettingsPage />) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>);
}

const ANA = makeMember({
  id: 'm-ana',
  authUserId: 'user-owner',
  email: 'ana@globalsys.com',
  role: 'owner',
  createdAt: '2026-03-10T12:00:00.000Z',
});
const BRUNO = makeMember({
  id: 'm-bruno',
  authUserId: 'user-bruno',
  email: 'bruno@globalsys.com',
  role: 'analyst',
  createdAt: '2026-05-02T12:00:00.000Z',
});

function seed(overrides: Parameters<typeof createFakeSettingsApi>[0] = {}): FakeSettingsApi {
  return createFakeSettingsApi({ members: [{ ...ANA }, { ...BRUNO }], ...overrides });
}

function userRows(): HTMLElement[] {
  return Array.from(document.querySelectorAll<HTMLElement>('tbody tr[data-member-id]'));
}

describe('parseEmails', () => {
  it('aceita um por linha, vírgula e ponto e vírgula, sem repetir', () => {
    expect(parseEmails('ana@x.com\nbruno@x.com, ana@x.com; CARLA@x.com  ')).toEqual([
      'ana@x.com',
      'bruno@x.com',
      'carla@x.com',
    ]);
  });

  it('devolve lista vazia quando não há nada', () => {
    expect(parseEmails('   \n  ')).toEqual([]);
  });
});

describe('summarizePlanUsage', () => {
  it('conta cada cliente uma vez por plano e faz a média do contrato mais recente', () => {
    const usage = summarizePlanUsage([
      makeContract({
        id: 'k1',
        portfolioClientId: 'c1',
        planId: 'p1',
        monthlyValue: 1000,
        startDate: '2025-01-01',
        contractedSlaHours: 6,
      }),
      // Renovação do mesmo cliente no mesmo plano: continua sendo um cliente só.
      makeContract({
        id: 'k2',
        portfolioClientId: 'c1',
        planId: 'p1',
        monthlyValue: 2000,
        startDate: '2026-01-01',
        contractedSlaHours: 6,
      }),
      makeContract({
        id: 'k3',
        portfolioClientId: 'c2',
        planId: 'p1',
        monthlyValue: 4000,
        startDate: '2026-02-01',
        contractedSlaHours: 6,
      }),
      makeContract({ id: 'k4', portfolioClientId: 'c3', planId: null, monthlyValue: 9000 }),
    ]);
    expect(usage.p1).toEqual({ clients: 2, averageMonthlyValue: 3000, slaHours: 6 });
    expect(Object.keys(usage)).toEqual(['p1']);
  });
});

describe('Configurações — aba Usuários', () => {
  let api: FakeSettingsApi;

  beforeEach(() => {
    auth.role = 'owner';
    auth.userId = 'user-owner';
    api = seed();
    vi.stubGlobal('fetch', api.fetch);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('lista quem tem acesso, com papel, data de entrada e quem é você', async () => {
    renderPage();
    await screen.findByText('ana@globalsys.com');
    const linhas = userRows();
    expect(linhas).toHaveLength(2);
    expect(within(linhas[0]!).getByText('(você)')).toBeInTheDocument();
    expect(within(linhas[0]!).getByText('owner')).toBeInTheDocument();
    expect(within(linhas[0]!).getByText('10/03/2026')).toBeInTheDocument();
    expect(within(linhas[1]!).getByText('analyst')).toBeInTheDocument();
  });

  it('explica os quatro papéis e quem pode o quê', async () => {
    renderPage();
    await screen.findByText('ana@globalsys.com');
    const referencia = screen.getByRole('region', { name: 'Os quatro papéis' });
    for (const papel of ['owner', 'admin', 'analyst', 'viewer']) {
      expect(within(referencia).getAllByText(papel).length).toBeGreaterThan(0);
    }
    const tabela = within(referencia).getByRole('table');
    const linha = within(tabela).getByRole('row', { name: /Gerenciar usuários/ });
    // owner sim, admin sim, analyst não, viewer não — na ordem das colunas.
    expect(
      within(linha)
        .getAllByRole('cell')
        .slice(1)
        .map((cell) => cell.textContent),
    ).toEqual(['sim', 'sim', 'não', 'não']);
  });

  it('convida vários e-mails de uma vez e mostra o resultado de cada um', async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByText('ana@globalsys.com');

    await user.click(screen.getByRole('button', { name: 'Convidar usuários' }));
    const form = await screen.findByRole('form', { name: 'Convidar usuários' });
    await user.type(
      within(form).getByLabelText('E-mails'),
      'carla@globalsys.com, ana@globalsys.com{Enter}sem-arroba',
    );
    await user.selectOptions(within(form).getByLabelText('Papel'), 'analyst');
    await user.click(within(form).getByRole('button', { name: 'Enviar convites' }));

    const resultado = await within(form).findByRole('list', { name: 'Resultado dos convites' });
    const itens = within(resultado)
      .getAllByRole('listitem')
      .map((item) => item.textContent);
    expect(itens[0]).toContain('carla@globalsys.com');
    expect(itens[0]).toContain('Convidado como analyst.');
    expect(itens[1]).toContain('ana@globalsys.com');
    expect(itens[1]).toContain('Este usuário já faz parte da organização.');
    expect(itens[2]).toContain('sem-arroba');
    expect(itens[2]).toContain('E-mail inválido.');
    expect(within(form).getByText('1 de 3 convidados.')).toBeInTheDocument();

    // Quem entrou some da caixa; o que falhou fica lá para corrigir e reenviar.
    expect(within(form).getByLabelText('E-mails')).toHaveValue(
      ['ana@globalsys.com', 'sem-arroba'].join('\n'),
    );
    expect(api.writes().filter((write) => write.method === 'POST')).toHaveLength(2);
    // A lista atrás do diálogo já recarregou com quem entrou.
    await waitFor(() => expect(userRows()).toHaveLength(3));
  });

  it('não oferece remover o próprio acesso', async () => {
    renderPage();
    await screen.findByText('ana@globalsys.com');
    expect(
      screen.queryByRole('button', { name: 'Remover o acesso de ana@globalsys.com' }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Remover o acesso de bruno@globalsys.com' }),
    ).toBeInTheDocument();
  });

  it('remove o acesso de outra pessoa depois de confirmar', async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByText('bruno@globalsys.com');

    await user.click(
      screen.getByRole('button', { name: 'Remover o acesso de bruno@globalsys.com' }),
    );
    await user.click(await screen.findByRole('button', { name: 'Remover acesso' }));

    await waitFor(() => expect(userRows()).toHaveLength(1));
    expect(api.writes()).toContainEqual({
      method: 'DELETE',
      url: '/api/v1/organizations/current/users/user-bruno',
      body: {},
    });
  });

  it('barra o último owner que tenta abrir mão do papel, com mensagem clara', async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByText('ana@globalsys.com');

    await user.click(screen.getByRole('button', { name: 'Mudar o papel de ana@globalsys.com' }));
    await user.selectOptions(await screen.findByLabelText('Papel'), 'admin');
    await user.click(screen.getByRole('button', { name: 'Confirmar papel' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'A organização precisa de pelo menos um owner.',
    );
    expect(api.store.members.find((m) => m.authUserId === 'user-owner')?.role).toBe('owner');
  });

  it('muda o papel de alguém depois de confirmar', async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByText('bruno@globalsys.com');

    await user.click(screen.getByRole('button', { name: 'Mudar o papel de bruno@globalsys.com' }));
    await user.selectOptions(await screen.findByLabelText('Papel'), 'admin');
    await user.click(screen.getByRole('button', { name: 'Confirmar papel' }));

    await waitFor(() =>
      expect(api.store.members.find((m) => m.authUserId === 'user-bruno')?.role).toBe('admin'),
    );
    expect(api.writes()).toContainEqual({
      method: 'PATCH',
      url: '/api/v1/organizations/current/users/user-bruno',
      body: { role: 'admin' },
    });
  });

  it('admin não oferece o papel owner no convite', async () => {
    auth.role = 'admin';
    auth.userId = 'user-bruno';
    const user = userEvent.setup();
    renderPage();
    await screen.findByText('ana@globalsys.com');

    await user.click(screen.getByRole('button', { name: 'Convidar usuários' }));
    const form = await screen.findByRole('form', { name: 'Convidar usuários' });
    const opcoes = within(within(form).getByLabelText('Papel'))
      .getAllByRole('option')
      .map((option) => option.textContent);
    expect(opcoes).toEqual(['admin', 'analyst', 'viewer']);
  });

  it('admin não mexe no owner, mas mexe nos demais', async () => {
    auth.role = 'admin';
    auth.userId = 'user-bruno';
    renderPage();
    await screen.findByText('ana@globalsys.com');

    expect(screen.getByText('Só o owner mexe em outro owner')).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Mudar o papel de ana@globalsys.com' }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Mudar o papel de bruno@globalsys.com' }),
    ).toBeInTheDocument();
  });

  it('viewer só lê: nenhum botão de escrita na tela', async () => {
    auth.role = 'viewer';
    auth.userId = 'user-bruno';
    renderPage();
    await screen.findByText('ana@globalsys.com');

    expect(screen.queryByRole('button', { name: 'Convidar usuários' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Mudar o papel de/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Remover o acesso de/ })).not.toBeInTheDocument();
    // A lista continua visível: viewer enxerga quem tem acesso.
    expect(userRows()).toHaveLength(2);
  });
});

describe('Configurações — aba Planos', () => {
  let api: FakeSettingsApi;

  beforeEach(() => {
    auth.role = 'owner';
    auth.userId = 'user-owner';
    api = seed({
      plans: [
        makePlan({ id: 'p-ent', name: 'Enterprise', description: 'Gerente dedicado' }),
        makePlan({ id: 'p-ess', name: 'Essencial' }),
      ],
      contracts: [
        makeContract({
          id: 'k1',
          portfolioClientId: 'c1',
          planId: 'p-ent',
          monthlyValue: 30000,
          contractedSlaHours: 6,
        }),
        makeContract({
          id: 'k2',
          portfolioClientId: 'c2',
          planId: 'p-ent',
          monthlyValue: 32000,
          contractedSlaHours: 6,
        }),
        makeContract({
          id: 'k3',
          portfolioClientId: 'c3',
          planId: 'p-ess',
          monthlyValue: 3000,
          contractedSlaHours: 24,
          status: 'ended',
        }),
      ],
    });
    vi.stubGlobal('fetch', api.fetch);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('mostra clientes, valor médio e SLA de cada plano vindos da API', async () => {
    const user = userEvent.setup();
    renderPage();
    await user.click(screen.getByRole('tab', { name: 'Planos' }));

    const enterprise = await waitFor(() => {
      const row = document.querySelector<HTMLElement>('tr[data-plan-usage-id="p-ent"]');
      if (row === null) throw new Error('linha do Enterprise ainda não renderizou');
      return row;
    });
    const celulas = within(enterprise)
      .getAllByRole('cell')
      .map((cell) => cell.textContent);
    expect(celulas[0]).toBe('Enterprise');
    expect(celulas[1]).toBe('Gerente dedicado');
    expect(celulas[2]).toBe('2');
    expect(celulas[3]).toContain('31.000');
    expect(celulas[4]).toBe('6 h');

    // Contrato encerrado continua contando o cliente naquele plano (a carteira histórica).
    const essencial = document.querySelector<HTMLElement>('tr[data-plan-usage-id="p-ess"]')!;
    expect(
      within(essencial)
        .getAllByRole('cell')
        .map((cell) => cell.textContent)[2],
    ).toBe('1');
  });
});

describe('Configurações — aba Organização', () => {
  let api: FakeSettingsApi;

  beforeEach(() => {
    auth.role = 'owner';
    auth.userId = 'user-owner';
    api = seed();
    vi.stubGlobal('fetch', api.fetch);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('salva o nome da organização', async () => {
    const user = userEvent.setup();
    renderPage();
    await user.click(screen.getByRole('tab', { name: 'Organização' }));

    const form = await screen.findByRole('form', { name: 'Dados da organização' });
    const nome = within(form).getByLabelText('Nome');
    expect(nome).toHaveValue('GlobalSys');
    await user.clear(nome);
    await user.type(nome, 'GlobalSys Brasil');
    await user.click(within(form).getByRole('button', { name: 'Salvar alterações' }));

    await waitFor(() => expect(api.store.organization.name).toBe('GlobalSys Brasil'));
  });

  it('viewer não edita os dados da organização', async () => {
    auth.role = 'viewer';
    auth.userId = 'user-bruno';
    const user = userEvent.setup();
    renderPage();
    await user.click(screen.getByRole('tab', { name: 'Organização' }));

    const form = await screen.findByRole('form', { name: 'Dados da organização' });
    expect(within(form).getByLabelText('Nome')).toBeDisabled();
    expect(
      within(form).queryByRole('button', { name: 'Salvar alterações' }),
    ).not.toBeInTheDocument();
  });
});
