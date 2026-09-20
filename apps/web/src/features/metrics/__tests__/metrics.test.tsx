import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { MetricDefinitionDetailDto, MetricDefinitionListItemDto } from '@inovaapss/shared';

import { jsonResponse } from '@/features/auth/__tests__/fake-supabase';

import { MetricDetailPage } from '../MetricDetailPage';
import { MetricsPage } from '../MetricsPage';
import { orderMetricItems } from '../order';
import { parseSeriesText } from '../parse-series';

import type { MetricPrefill } from '@/features/documents/api';

const SLA_ID = '11111111-1111-4111-8111-111111111111';
const USO_ID = '22222222-2222-4222-8222-222222222222';
const NEW_ID = '33333333-3333-4333-8333-333333333333';

/** Formato de docs/DOCUMENTS.md §3: o que /documents/:id manda em state.prefill ao aceitar. */
const PREFILL: MetricPrefill = {
  name: 'Tempo médio de resolução',
  slug: 'tempo-medio-de-resolucao',
  description: 'Horas entre abertura e resolução dos chamados.',
  category: 'Atendimento',
  metricType: 'TIME',
  unit: 'h',
  direction: 'HIGHER_IS_WORSE',
  sourceType: 'DOCUMENT',
  periodicity: 'MONTHLY',
  weight: 0.16,
  normalization: null,
  formula: null,
  isActive: false,
  origin: { documentId: 'doc-1', suggestionId: 'sug-1', fileName: 'manual-kpi.docx' },
};

function definition(
  overrides: Partial<MetricDefinitionListItemDto> &
    Pick<MetricDefinitionListItemDto, 'id' | 'name' | 'slug'>,
): MetricDefinitionListItemDto {
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
    createdAt: '2026-09-19T00:00:00.000Z',
    updatedAt: '2026-09-19T00:00:00.000Z',
    activePlacement: null,
    ...overrides,
  };
}

const ROWS: MetricDefinitionListItemDto[] = [
  definition({
    id: SLA_ID,
    name: 'Cumprimento de SLA',
    slug: 'sla_compliance',
    activePlacement: {
      modelId: 'model-1',
      modelName: 'GlobalSys',
      version: 2,
      weight: 0.12,
      sortOrder: 4,
      normalizationStrategy: 'LINEAR_RANGE',
    },
  }),
  definition({
    id: USO_ID,
    name: 'Uso da plataforma',
    slug: 'platform_usage',
    isActive: false,
  }),
];

const DETAIL: MetricDefinitionDetailDto = {
  definition: {
    ...ROWS[0]!,
    activePlacement: undefined,
  } as unknown as MetricDefinitionDetailDto['definition'],
  activeItem: {
    id: 'item-1',
    metricModelVersionId: 'v-2',
    metricDefinitionId: SLA_ID,
    weight: 0.12,
    currentWeight: 0.45,
    trendWeight: 0.35,
    persistenceWeight: 0.2,
    normalizationStrategy: 'LINEAR_RANGE',
    normalizationConfig: { strategy: 'LINEAR_RANGE', min: 0, max: 100 },
    thresholdConfig: { trend: { window: 3 } },
    criticalTriggerConfig: [
      {
        id: 'queda',
        name: 'SLA abaixo de 70 %',
        kind: 'THRESHOLD',
        field: 'value',
        operator: '<',
        threshold: 70,
        priorityFloor: 70,
      },
    ],
    formulaConfig: null,
    sortOrder: 4,
  },
  activeModel: { id: 'model-1', name: 'GlobalSys', version: 2 },
};

const SCORE = {
  metricId: SLA_ID,
  metricName: 'Cumprimento de SLA',
  metricHealth: 80.11,
  currentHealth: 80,
  trendHealth: 68.89,
  persistenceHealth: 100,
  confidence: 100,
  currentValue: 80,
  previousValue: 85,
  components: { weightsUsed: { current: 0.45, trend: 0.35, persistence: 0.2 } },
  normalization: { baseline: null, deviationPct: null, reason: null },
  trend: { changePercent: -11.11, periodsUsed: 3, reason: null },
  persistence: { unhealthyPeriods: 0, evaluatedPeriods: 3, reason: null },
  triggers: { hits: [] },
  explanation: {
    summary: 'Cumprimento de SLA caiu 10 p.p. em 3 meses.',
    components: [
      'Atual: 80 (LINEAR_RANGE)',
      'Tendência: 68,89 (DELTA_PERCENT)',
      'Persistência: 100',
    ],
    notes: [],
  },
};

function renderAt(path: string, state?: unknown) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[state === undefined ? path : { pathname: path, state }]}>
        <Routes>
          <Route path="/metrics" element={<MetricsPage />} />
          <Route path="/metrics/:id" element={<MetricDetailPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

const fetchMock = vi.fn<typeof fetch>();
const requestedUrls = () => fetchMock.mock.calls.map(([input]) => String(input));

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => {
  vi.unstubAllGlobals();
});

function mockApi(
  options: { listStatus?: number; previewStatus?: number; createStatus?: number } = {},
) {
  fetchMock.mockImplementation(async (input, init) => {
    const url = new URL(String(input));
    if (url.pathname === '/api/v1/metrics' && init?.method === 'POST') {
      if (options.createStatus !== undefined && options.createStatus >= 400) {
        return jsonResponse(options.createStatus, {
          error: { code: 'SLUG_TAKEN', message: 'Já existe uma métrica com essa chave.' },
        });
      }
      const body = JSON.parse(String(init.body)) as Record<string, unknown>;
      return jsonResponse(201, {
        definition: { ...ROWS[0]!, ...body, id: NEW_ID, activePlacement: undefined },
      });
    }
    if (url.pathname === '/api/v1/metrics') {
      if (options.listStatus !== undefined && options.listStatus >= 400) {
        return jsonResponse(options.listStatus, {
          error: { code: 'INTERNAL_ERROR', message: 'Banco indisponível.' },
        });
      }
      const search = url.searchParams.get('search') ?? '';
      const isActive = url.searchParams.get('is_active');
      let items = ROWS.filter((row) => row.name.toLowerCase().includes(search.toLowerCase()));
      if (isActive !== null) items = items.filter((row) => row.isActive === (isActive === 'true'));
      return jsonResponse(200, { items, total: items.length, page: 1, pageSize: 20 });
    }
    if (url.pathname === `/api/v1/metrics/${SLA_ID}/preview-score` && init?.method === 'POST') {
      if (options.previewStatus !== undefined && options.previewStatus >= 400) {
        return jsonResponse(options.previewStatus, {
          error: { code: 'INVALID_METRIC_CONFIG', message: 'Tendência: a janela precisa ser ≥ 2.' },
        });
      }
      return jsonResponse(200, { score: SCORE });
    }
    if (url.pathname === `/api/v1/metrics/${SLA_ID}`) {
      return jsonResponse(200, DETAIL);
    }
    if (url.pathname === `/api/v1/metrics/${NEW_ID}`) {
      return jsonResponse(200, {
        ...DETAIL,
        definition: { ...DETAIL.definition, id: NEW_ID, name: PREFILL.name, slug: PREFILL.slug },
        activeItem: null,
        activeModel: null,
      });
    }
    return jsonResponse(404, { error: { code: 'NOT_FOUND', message: url.pathname } });
  });
}

describe('MetricsPage (/metrics)', () => {
  it('ordena primeiro pelo modelo ativo e depois alfabeticamente', () => {
    const unordered = [
      definition({ id: 'metric-z', name: 'Zeta', slug: 'zeta' }),
      definition({
        id: 'metric-active-3',
        name: 'Terceira no modelo',
        slug: 'terceira',
        activePlacement: { ...ROWS[0]!.activePlacement!, sortOrder: 3 },
      }),
      definition({ id: 'metric-a', name: 'Alfa', slug: 'alfa' }),
      definition({
        id: 'metric-active-1',
        name: 'Primeira no modelo',
        slug: 'primeira',
        activePlacement: { ...ROWS[0]!.activePlacement!, sortOrder: 1 },
      }),
    ];

    expect(orderMetricItems(unordered).map((item) => item.id)).toEqual([
      'metric-active-1',
      'metric-active-3',
      'metric-a',
      'metric-z',
    ]);
    expect(unordered[0]?.id).toBe('metric-z');
  });

  it('mostra a tabela §41 com peso, ordem e normalização da versão ativa', async () => {
    mockApi();
    renderAt('/metrics');

    const table = await screen.findByRole('table', { name: 'Métricas da organização' });
    const rows = within(table).getAllByRole('row').slice(1);
    expect(rows).toHaveLength(2);

    const sla = within(rows[0]!);
    expect(sla.getByRole('link', { name: 'Cumprimento de SLA' })).toHaveAttribute(
      'href',
      `/metrics/${SLA_ID}`,
    );
    expect(sla.getByText('Sim')).toBeInTheDocument();
    expect(sla.getByText('4')).toBeInTheDocument();
    expect(sla.getByText('12 %')).toBeInTheDocument();
    expect(sla.getByText('Percentual')).toBeInTheDocument();
    expect(sla.getByText('Maior é melhor')).toBeInTheDocument();
    expect(sla.getByText('Escala linear')).toBeInTheDocument();
    expect(sla.getByText('No modelo ativo (GlobalSys v2)')).toBeInTheDocument();

    const uso = within(rows[1]!);
    expect(uso.getByText('Não')).toBeInTheDocument();
    expect(uso.getByText('Desativada')).toBeInTheDocument();
    expect(uso.getAllByText('—').length).toBeGreaterThanOrEqual(2);

    expect(screen.getByText('2 métricas')).toBeInTheDocument();
  });

  it('busca e filtros vão para a query string da API', async () => {
    mockApi();
    const user = userEvent.setup();
    renderAt('/metrics');
    await screen.findByRole('table', { name: 'Métricas da organização' });

    await user.type(screen.getByLabelText('Buscar por nome ou chave'), 'uso');
    await waitFor(() => {
      expect(requestedUrls().some((url) => url.includes('search=uso'))).toBe(true);
    });
    await waitFor(() => {
      expect(screen.queryByRole('link', { name: 'Cumprimento de SLA' })).not.toBeInTheDocument();
    });

    await user.selectOptions(screen.getByLabelText('Situação'), 'true');
    await waitFor(() => {
      expect(requestedUrls().some((url) => url.includes('is_active=true'))).toBe(true);
    });
    expect(await screen.findByText('Nenhuma métrica corresponde aos filtros')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Limpar filtros' }));
    expect(await screen.findByRole('link', { name: 'Cumprimento de SLA' })).toBeInTheDocument();
  });

  it('mostra o estado de erro com a mensagem da API e permite tentar de novo', async () => {
    mockApi({ listStatus: 500 });
    renderAt('/metrics');
    expect(await screen.findByText('Não foi possível carregar as métricas')).toBeInTheDocument();
    expect(screen.getByText('Banco indisponível.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Tentar de novo' })).toBeInTheDocument();
  });

  it('mostra o estado vazio quando a organização não tem métricas', async () => {
    fetchMock.mockImplementation(async () =>
      jsonResponse(200, { items: [], total: 0, page: 1, pageSize: 20 }),
    );
    renderAt('/metrics');
    expect(await screen.findByText('Nenhuma métrica definida')).toBeInTheDocument();
  });
});

describe('MetricDetailPage (/metrics/:id)', () => {
  it('explica a configuração da versão ativa em português', async () => {
    mockApi();
    renderAt(`/metrics/${SLA_ID}`);

    expect(await screen.findByRole('heading', { name: 'Cumprimento de SLA' })).toBeInTheDocument();
    expect(screen.getByText('GlobalSys v2 · peso 12 % · ordem 4')).toBeInTheDocument();
    expect(screen.getByText('Estratégia: Escala linear.')).toBeInTheDocument();
    expect(screen.getByText('Escala de 0 a 100: 0 vale 0 e 100 vale 100.')).toBeInTheDocument();
    expect(
      screen.getByText(
        'Health da métrica = atual × 45 % + tendência × 35 % + persistência × 20 %.',
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        'SLA abaixo de 70 %: quando value < 70 — eleva a prioridade a pelo menos 70.',
      ),
    ).toBeInTheDocument();
  });

  it('o painel Simular chama preview-score com os valores digitados e mostra os componentes', async () => {
    mockApi();
    const user = userEvent.setup();
    renderAt(`/metrics/${SLA_ID}`);
    await screen.findByRole('heading', { name: 'Simular' });

    const input = screen.getByLabelText(/Valores por período/);
    await user.clear(input);
    await user.type(input, '90; 85; x; 80');
    await user.click(screen.getByRole('button', { name: 'Simular' }));

    const dl = await screen.findByLabelText('Componentes do score');
    expect(within(dl).getByText('80')).toBeInTheDocument();
    expect(within(dl).getByText('68,89')).toBeInTheDocument();
    expect(within(dl).getByText('80,11')).toBeInTheDocument();
    expect(screen.getByText('Cumprimento de SLA caiu 10 p.p. em 3 meses.')).toBeInTheDocument();

    const post = fetchMock.mock.calls.find(([, init]) => init?.method === 'POST');
    expect(post).toBeDefined();
    const body = JSON.parse(String(post![1]?.body)) as {
      item: { normalization: { strategy: string } };
      series: { value: number | null }[];
      periodLabel: string;
    };
    expect(body.series.map((p) => p.value)).toEqual([90, 85, null, 80]);
    expect(body.item.normalization.strategy).toBe('LINEAR_RANGE');
    expect(body.periodLabel).toBe('mês');
  });

  it('mostra o erro do motor quando a simulação falha', async () => {
    mockApi({ previewStatus: 400 });
    const user = userEvent.setup();
    renderAt(`/metrics/${SLA_ID}`);
    await screen.findByRole('heading', { name: 'Simular' });
    await user.click(screen.getByRole('button', { name: 'Simular' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Tendência: a janela precisa ser ≥ 2.',
    );
  });
});

describe('parseSeriesText', () => {
  it('aceita vírgula, ponto e vírgula, quebra de linha, decimal com ponto e "x" para sem dado', () => {
    expect(parseSeriesText('90, 85.5; x\n80')).toEqual([90, 85.5, null, 80]);
    expect(parseSeriesText('90,,80')).toEqual([90, null, 80]);
    expect(parseSeriesText('')).toEqual([]);
  });
});

describe('sugestão aceita em /documents (state.prefill)', () => {
  it('mostra a sugestão e cria a métrica inativa em POST /metrics, indo para o detalhe', async () => {
    mockApi();
    const user = userEvent.setup();
    renderAt('/metrics', { prefill: PREFILL });

    const banner = within(await screen.findByRole('status', { name: /Sugestão aceita/ }));
    expect(banner.getByText(/do documento manual-kpi.docx/)).toBeInTheDocument();
    expect(banner.getByText('Tempo médio de resolução')).toBeInTheDocument();
    expect(banner.getByText('tempo-medio-de-resolucao')).toBeInTheDocument();
    expect(
      banner.getByText(/Tempo · Maior é pior · unidade h · peso sugerido 16 %/),
    ).toBeInTheDocument();

    await user.click(banner.getByRole('button', { name: 'Criar métrica' }));

    await waitFor(() => {
      expect(requestedUrls().some((url) => url.endsWith(`/api/v1/metrics/${NEW_ID}`))).toBe(true);
    });
    const post = fetchMock.mock.calls.find(([, init]) => init?.method === 'POST');
    expect(post).toBeDefined();
    expect(JSON.parse(String(post![1]!.body))).toMatchObject({
      name: PREFILL.name,
      slug: PREFILL.slug,
      metricType: 'TIME',
      direction: 'HIGHER_IS_WORSE',
      sourceType: 'DOCUMENT',
      isActive: false,
    });
    expect(
      await screen.findByRole('heading', { name: 'Tempo médio de resolução' }),
    ).toBeInTheDocument();
  });

  it('mostra o erro da API (chave repetida) e permite descartar a sugestão', async () => {
    mockApi({ createStatus: 409 });
    const user = userEvent.setup();
    renderAt('/metrics', { prefill: PREFILL });

    const banner = await screen.findByRole('status', { name: /Sugestão aceita/ });
    await user.click(within(banner).getByRole('button', { name: 'Criar métrica' }));
    expect(await within(banner).findByRole('alert')).toHaveTextContent(
      'Já existe uma métrica com essa chave.',
    );

    await user.click(within(banner).getByRole('button', { name: 'Descartar' }));
    await waitFor(() => {
      expect(screen.queryByRole('status', { name: /Sugestão aceita/ })).not.toBeInTheDocument();
    });
    expect(
      await screen.findByRole('table', { name: 'Métricas da organização' }),
    ).toBeInTheDocument();
  });
});
