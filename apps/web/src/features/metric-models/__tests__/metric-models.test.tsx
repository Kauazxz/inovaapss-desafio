import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type {
  MetricDefinitionDto,
  MetricModelDto,
  MetricModelItemDto,
  MetricModelVersionDto,
} from '@inovaapss/shared';

import { jsonResponse } from '@/features/auth/__tests__/fake-supabase';

import {
  applyRebalance,
  compareItems,
  draftToItems,
  moveDraftItem,
  percentToWeight,
  versionToDraft,
  weightToPercent,
  weightsCheck,
} from '../draft';
import { MetricModelDetailPage } from '../MetricModelDetailPage';
import { MetricModelsPage } from '../MetricModelsPage';

const MODEL_ID = '44444444-4444-4444-8444-444444444444';
const SLA_ID = '11111111-1111-4111-8111-111111111111';
const USO_ID = '22222222-2222-4222-8222-222222222222';
const NPS_ID = '33333333-3333-4333-8333-333333333333';

const MODEL: MetricModelDto = {
  id: MODEL_ID,
  organizationId: 'org',
  name: 'GlobalSys v1',
  mode: 'ASSISTED',
  isActive: true,
  createdAt: '2026-09-01T00:00:00.000Z',
  updatedAt: '2026-09-01T00:00:00.000Z',
};

function definition(
  overrides: Pick<MetricDefinitionDto, 'id' | 'name' | 'slug'> & Partial<MetricDefinitionDto>,
): MetricDefinitionDto {
  return {
    organizationId: 'org',
    description: null,
    category: null,
    metricType: 'PERCENTAGE',
    unit: '%',
    direction: 'HIGHER_IS_BETTER',
    periodicity: 'MONTHLY',
    sourceType: 'MANUAL',
    isActive: true,
    createdAt: '2026-09-01T00:00:00.000Z',
    updatedAt: '2026-09-01T00:00:00.000Z',
    ...overrides,
  };
}

const DEFINITIONS: MetricDefinitionDto[] = [
  definition({ id: SLA_ID, name: 'Cumprimento de SLA', slug: 'sla_compliance' }),
  definition({ id: USO_ID, name: 'Uso da plataforma', slug: 'platform_usage' }),
  definition({ id: NPS_ID, name: 'Insatisfação / NPS', slug: 'nps', metricType: 'SCORE' }),
];

function item(
  versionId: string,
  metricDefinitionId: string,
  weight: number,
  sortOrder: number,
): MetricModelItemDto {
  return {
    id: `${versionId}-${metricDefinitionId}`,
    metricModelVersionId: versionId,
    metricDefinitionId,
    weight,
    currentWeight: 0.45,
    trendWeight: 0.35,
    persistenceWeight: 0.2,
    normalizationStrategy: 'LINEAR_RANGE',
    normalizationConfig: { strategy: 'LINEAR_RANGE', min: 0, max: 100 },
    thresholdConfig: { trend: { window: 3 } },
    criticalTriggerConfig: null,
    formulaConfig: null,
    sortOrder,
  };
}

function versions(): MetricModelVersionDto[] {
  return [
    {
      id: 'ver-1',
      metricModelId: MODEL_ID,
      organizationId: 'org',
      version: 1,
      status: 'active',
      effectiveFrom: '2026-03-01T00:00:00.000Z',
      createdAt: '2026-03-01T00:00:00.000Z',
      items: [item('ver-1', SLA_ID, 0.6, 1), item('ver-1', USO_ID, 0.4, 2)],
    },
    {
      id: 'ver-2',
      metricModelId: MODEL_ID,
      organizationId: 'org',
      version: 2,
      status: 'draft',
      effectiveFrom: null,
      createdAt: '2026-09-18T00:00:00.000Z',
      items: [item('ver-2', SLA_ID, 0.5, 1), item('ver-2', USO_ID, 0.4, 2)],
    },
  ];
}

interface ServerState {
  versions: MetricModelVersionDto[];
  patched: { items: unknown[] } | null;
  activated: number | null;
  rebalanceBody: unknown;
  previewBody: unknown;
}

let server: ServerState;
const fetchMock = vi.fn<typeof fetch>();

const PROPOSAL = {
  rows: [
    { metricDefinitionId: SLA_ID, currentWeight: 0.5, proposedWeight: 0.5556, difference: 0.0556 },
    { metricDefinitionId: USO_ID, currentWeight: 0.4, proposedWeight: 0.4444, difference: 0.0444 },
  ],
  currentTotal: 0.9,
  proposedTotal: 1,
  saved: false as const,
};

const SCORE = {
  metricId: USO_ID,
  metricName: 'Uso da plataforma',
  metricHealth: 74.5,
  currentHealth: 80,
  trendHealth: 65,
  persistenceHealth: 100,
  confidence: 100,
  currentValue: 80,
  previousValue: 85,
  components: { weightsUsed: { current: 0.45, trend: 0.35, persistence: 0.2 } },
  normalization: { baseline: null, deviationPct: null, reason: null },
  trend: { changePercent: -11.11, periodsUsed: 3, reason: null },
  persistence: { unhealthyPeriods: 0, evaluatedPeriods: 3, reason: null },
  triggers: { hits: [] },
  explanation: { summary: 'Uso caiu 10 pontos em 3 meses.', components: [], notes: [] },
};

function mockApi() {
  fetchMock.mockImplementation(async (input, init) => {
    const url = new URL(String(input));
    const path = url.pathname;
    const method = init?.method ?? 'GET';
    const body = init?.body === undefined ? null : JSON.parse(String(init.body));

    if (path === '/api/v1/metrics' && method === 'GET') {
      return jsonResponse(200, {
        items: DEFINITIONS,
        total: DEFINITIONS.length,
        page: 1,
        pageSize: 200,
      });
    }
    if (path === `/api/v1/metrics/${USO_ID}/preview-score` && method === 'POST') {
      server.previewBody = body;
      return jsonResponse(200, { score: SCORE });
    }
    if (path === '/api/v1/metric-models' && method === 'GET') {
      return jsonResponse(200, { items: [MODEL], total: 1, page: 1, pageSize: 50 });
    }
    if (path === `/api/v1/metric-models/${MODEL_ID}` && method === 'GET') {
      return jsonResponse(200, { model: MODEL, versions: server.versions });
    }
    if (path === `/api/v1/metric-models/${MODEL_ID}/rebalance` && method === 'POST') {
      server.rebalanceBody = body;
      return jsonResponse(200, PROPOSAL);
    }
    if (path === `/api/v1/metric-models/${MODEL_ID}/versions/2` && method === 'PATCH') {
      server.patched = body as { items: unknown[] };
      const items = (
        body as { items: { metricDefinitionId: string; weight: number; sortOrder: number }[] }
      ).items;
      server.versions = server.versions.map((version) =>
        version.version === 2
          ? {
              ...version,
              items: items.map((row) =>
                item('ver-2', row.metricDefinitionId, row.weight, row.sortOrder),
              ),
            }
          : version,
      );
      return jsonResponse(200, { version: server.versions[1] });
    }
    if (path === `/api/v1/metric-models/${MODEL_ID}/versions/2/activate` && method === 'POST') {
      server.activated = 2;
      server.versions = server.versions.map((version) => ({
        ...version,
        status: version.version === 2 ? ('active' as const) : ('archived' as const),
      }));
      return jsonResponse(200, { version: server.versions[1] });
    }
    return jsonResponse(404, { error: { code: 'NOT_FOUND', message: path } });
  });
}

function renderAt(path: string) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/metric-models" element={<MetricModelsPage />} />
          <Route path="/metric-models/:id" element={<MetricModelDetailPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  server = {
    versions: versions(),
    patched: null,
    activated: null,
    rebalanceBody: null,
    previewBody: null,
  };
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
  mockApi();
});
afterEach(() => {
  vi.unstubAllGlobals();
});

describe('MetricModelsPage (/metric-models)', () => {
  it('resume cada modelo: modo, versão ativa, quantas métricas e a soma dos pesos', async () => {
    renderAt('/metric-models');

    const table = await screen.findByRole('table', { name: 'Modelos de métricas' });
    const row = within(table).getAllByRole('row')[1];
    expect(row).toBeDefined();
    const cells = within(row as HTMLElement);
    expect(cells.getByRole('link', { name: 'GlobalSys v1' })).toHaveAttribute(
      'href',
      `/metric-models/${MODEL_ID}`,
    );
    expect(cells.getByText('Assistido')).toBeInTheDocument();
    expect(await cells.findByText('versão 1')).toBeInTheDocument();
    expect(cells.getByText('100 %')).toBeInTheDocument();
    expect(cells.getByText('Rascunho v2 em aberto')).toBeInTheDocument();
  });

  it('avisa que o modelo vale para a organização inteira', async () => {
    renderAt('/metric-models');
    expect(
      await screen.findByText(/muda o score de todos os clientes a partir da ativação/),
    ).toBeInTheDocument();
  });
});

describe('MetricModelDetailPage (/metric-models/:id) — pesos', () => {
  it('mostra a soma o tempo todo e só libera "Ativar versão" com 100 % salvos', async () => {
    const user = userEvent.setup();
    renderAt(`/metric-models/${MODEL_ID}`);

    const total = await screen.findByRole('status', { name: 'Soma dos pesos' });
    expect(within(total).getByText('Soma dos pesos: 90 %')).toBeInTheDocument();
    expect(within(total).getByText('Total: 90 % — faltam 10 %.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Ativar versão' })).toBeDisabled();

    const uso = screen.getByLabelText('Peso de Uso da plataforma em porcentagem');
    await user.clear(uso);
    await user.type(uso, '50');

    expect(await within(total).findByText('Soma dos pesos: 100 %')).toBeInTheDocument();
    // Somou 100 %, mas o rascunho ainda não foi salvo: ativar continua bloqueado.
    expect(screen.getByRole('button', { name: 'Ativar versão' })).toBeDisabled();
    expect(screen.getByText('Salve o rascunho antes de ativar.')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Salvar rascunho' }));
    await waitFor(() => {
      expect(server.patched).not.toBeNull();
    });
    expect(server.patched?.items).toEqual([
      expect.objectContaining({ metricDefinitionId: SLA_ID, weight: 0.5, sortOrder: 1 }),
      expect.objectContaining({ metricDefinitionId: USO_ID, weight: 0.5, sortOrder: 2 }),
    ]);
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Ativar versão' })).toBeEnabled();
    });
  });

  it('a redistribuição é uma proposta: só muda o rascunho depois de aplicar', async () => {
    const user = userEvent.setup();
    renderAt(`/metric-models/${MODEL_ID}`);
    await screen.findByRole('table', { name: 'Métricas do modelo' });

    await user.click(screen.getByRole('button', { name: 'Redistribuir pesos' }));

    const proposal = await screen.findByRole('table', {
      name: 'Proposta de redistribuição de pesos',
    });
    expect(within(proposal).getByText('55,56 %')).toBeInTheDocument();
    expect(server.patched).toBeNull();
    expect(server.rebalanceBody).toEqual({
      items: [
        { metricDefinitionId: SLA_ID, weight: 0.5 },
        { metricDefinitionId: USO_ID, weight: 0.4 },
      ],
    });

    await user.click(screen.getByRole('button', { name: 'Aplicar ao rascunho' }));

    const total = screen.getByRole('status', { name: 'Soma dos pesos' });
    expect(within(total).getByText('Soma dos pesos: 100 %')).toBeInTheDocument();
    // Aplicar mexe no rascunho local, nunca no servidor.
    expect(server.patched).toBeNull();
  });

  it('descartar a proposta não muda peso nenhum', async () => {
    const user = userEvent.setup();
    renderAt(`/metric-models/${MODEL_ID}`);
    await screen.findByRole('table', { name: 'Métricas do modelo' });

    await user.click(screen.getByRole('button', { name: 'Redistribuir pesos' }));
    await screen.findByRole('table', { name: 'Proposta de redistribuição de pesos' });
    await user.click(screen.getByRole('button', { name: 'Descartar proposta' }));

    const total = screen.getByRole('status', { name: 'Soma dos pesos' });
    expect(within(total).getByText('Soma dos pesos: 90 %')).toBeInTheDocument();
  });

  it('reordena pelo teclado e grava a nova ordem', async () => {
    const user = userEvent.setup();
    renderAt(`/metric-models/${MODEL_ID}`);
    await screen.findByRole('table', { name: 'Métricas do modelo' });

    await user.click(screen.getByRole('button', { name: 'Descer Cumprimento de SLA' }));
    await user.click(screen.getByRole('button', { name: 'Salvar rascunho' }));

    await waitFor(() => {
      expect(server.patched).not.toBeNull();
    });
    expect(server.patched?.items).toEqual([
      expect.objectContaining({ metricDefinitionId: USO_ID, sortOrder: 1 }),
      expect.objectContaining({ metricDefinitionId: SLA_ID, sortOrder: 2 }),
    ]);
  });

  it('ativar mostra o que muda para a organização antes de confirmar', async () => {
    const user = userEvent.setup();
    renderAt(`/metric-models/${MODEL_ID}`);
    await screen.findByRole('table', { name: 'Métricas do modelo' });

    const uso = screen.getByLabelText('Peso de Uso da plataforma em porcentagem');
    await user.clear(uso);
    await user.type(uso, '50');
    await user.click(screen.getByRole('button', { name: 'Salvar rascunho' }));
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Ativar versão' })).toBeEnabled();
    });

    await user.click(screen.getByRole('button', { name: 'Ativar versão' }));

    const changes = await screen.findByRole('list', { name: 'Mudanças da versão' });
    expect(within(changes).getByText(/peso de 60 % para 50 %/)).toBeInTheDocument();
    expect(within(changes).getByText(/peso de 40 % para 50 %/)).toBeInTheDocument();
    expect(screen.getByText(/Vale para a organização inteira/)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Ativar a versão 2' }));
    await waitFor(() => {
      expect(server.activated).toBe(2);
    });
  });
});

describe('MetricModelDetailPage — painel de configuração', () => {
  it('valida a normalização com o schema da API antes de aplicar', async () => {
    const user = userEvent.setup();
    renderAt(`/metric-models/${MODEL_ID}`);
    await screen.findByRole('table', { name: 'Métricas do modelo' });

    await user.click(screen.getByRole('button', { name: 'Configurar Uso da plataforma' }));
    const panel = await screen.findByRole('complementary', {
      name: 'Configuração de Uso da plataforma',
    });

    const min = within(panel).getByLabelText('Mínimo');
    const max = within(panel).getByLabelText('Máximo');
    await user.clear(min);
    await user.type(min, '100');
    await user.clear(max);
    await user.type(max, '10');
    await user.click(within(panel).getByRole('button', { name: 'Aplicar ao rascunho' }));

    expect(await within(panel).findByRole('alert')).toHaveTextContent(
      /min precisa ser menor que max/,
    );
  });

  it('troca a estratégia e o rascunho passa a usar as faixas', async () => {
    const user = userEvent.setup();
    renderAt(`/metric-models/${MODEL_ID}`);
    const table = await screen.findByRole('table', { name: 'Métricas do modelo' });
    expect(within(table).getAllByText('Escala linear')).toHaveLength(2);

    await user.click(screen.getByRole('button', { name: 'Configurar Uso da plataforma' }));
    const panel = await screen.findByRole('complementary', {
      name: 'Configuração de Uso da plataforma',
    });

    // A faixa que já vem é a do "resto": limite em branco (null) e health 100.
    await user.selectOptions(within(panel).getByLabelText('Estratégia'), 'THRESHOLD_BANDS');
    await user.click(within(panel).getByRole('button', { name: 'Aplicar ao rascunho' }));

    const row = within(table)
      .getAllByRole('row')
      .find((candidate) => within(candidate).queryByText('platform_usage') !== null);
    expect(row).toBeDefined();
    expect(within(row as HTMLElement).getByText('Faixas de limite')).toBeInTheDocument();
    expect(server.patched).toBeNull();
  });

  it('simula a configuração do rascunho sem salvar nada', async () => {
    const user = userEvent.setup();
    renderAt(`/metric-models/${MODEL_ID}`);
    await screen.findByRole('table', { name: 'Métricas do modelo' });

    await user.click(screen.getByRole('button', { name: 'Configurar Uso da plataforma' }));
    const panel = await screen.findByRole('complementary', {
      name: 'Configuração de Uso da plataforma',
    });

    await user.click(within(panel).getByRole('button', { name: 'Simular' }));

    expect(await within(panel).findByLabelText('Componentes do score')).toBeInTheDocument();
    expect(server.previewBody).toMatchObject({
      item: { normalization: { strategy: 'LINEAR_RANGE', min: 0, max: 100 } },
    });
    expect(server.patched).toBeNull();
  });
});

describe('rascunho (funções puras)', () => {
  const draft = versionToDraft(versions()[1] as MetricModelVersionDto);
  const byId = new Map(DEFINITIONS.map((d) => [d.id, d]));

  it('a soma conta só as métricas incluídas cuja definição está ativa', () => {
    expect(weightsCheck(draft, byId).total).toBe(0.9);
    expect(weightsCheck(draft, byId).ok).toBe(false);

    const semUso = draft.map((row) =>
      row.metricDefinitionId === USO_ID ? { ...row, included: false } : row,
    );
    expect(weightsCheck(semUso, byId).total).toBe(0.5);

    const desativada = new Map(byId);
    desativada.set(USO_ID, { ...(byId.get(USO_ID) as MetricDefinitionDto), isActive: false });
    expect(weightsCheck(draft, desativada).total).toBe(0.5);
  });

  it('a ordem vira sortOrder de 1 em diante e linhas fora da versão não são enviadas', () => {
    const movido = moveDraftItem(draft, 0, 1);
    expect(draftToItems(movido).map((row) => row.metricDefinitionId)).toEqual([USO_ID, SLA_ID]);
    expect(draftToItems(movido).map((row) => row.sortOrder)).toEqual([1, 2]);

    const semSla = draft.map((row) =>
      row.metricDefinitionId === SLA_ID ? { ...row, included: false } : row,
    );
    expect(draftToItems(semSla)).toHaveLength(1);
  });

  it('percentual e fração convertem nos dois sentidos com 4 casas', () => {
    expect(percentToWeight(18.5)).toBe(0.185);
    expect(weightToPercent(0.185)).toBe(18.5);
    expect(percentToWeight(33.333)).toBe(0.3333);
  });

  it('aplicar a proposta muda só os pesos propostos', () => {
    const aplicado = applyRebalance(draft, PROPOSAL.rows);
    expect(aplicado.map((row) => row.weight)).toEqual([0.5556, 0.4444]);
  });

  it('a comparação entre versões explica o que entra, o que sai e o que muda de peso', () => {
    const [ativa, rascunho] = versions();
    const changes = compareItems(
      (ativa as MetricModelVersionDto).items,
      [
        ...(rascunho as MetricModelVersionDto).items.filter(
          (row) => row.metricDefinitionId === SLA_ID,
        ),
        item('ver-2', NPS_ID, 0.5, 2),
      ],
      (id) => DEFINITIONS.find((d) => d.id === id)?.name ?? '?',
    );
    expect(changes).toEqual([
      expect.objectContaining({ kind: 'weight', description: 'peso de 60 % para 50 %' }),
      expect.objectContaining({
        kind: 'added',
        metricName: 'Insatisfação / NPS',
        description: 'entra no modelo com peso 50 %',
      }),
      expect.objectContaining({ kind: 'removed', metricName: 'Uso da plataforma' }),
    ]);
  });
});
