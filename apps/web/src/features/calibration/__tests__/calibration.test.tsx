/**
 * Tela /calibration (§43).
 *
 * O que está travado aqui é o que diferencia esta tela de um painel de números: a explicação
 * aparece antes dos números, cada indicador vem com a frase do que significa, o aviso sobre a
 * base pequena está visível, e criar versão passa por uma confirmação que diz, com todas as
 * letras, que nada muda até alguém ATIVAR.
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { CalibrationRunDto, CalibrationSuggestionDto } from '@inovaapss/shared';

import { jsonResponse } from '@/features/auth/__tests__/fake-supabase';

import { CalibrationPage } from '../CalibrationPage';

const RUN_ID = '11111111-1111-4111-8111-111111111111';
const SLA = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const USO = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

function suggestion(
  over: Partial<CalibrationSuggestionDto> &
    Pick<CalibrationSuggestionDto, 'metricId' | 'metricName'>,
): CalibrationSuggestionDto {
  return {
    currentWeight: 0.5,
    suggestedWeight: 0.5,
    delta: 0,
    historicalImportance: 0.5,
    meanHealthChurned: 40,
    meanHealthRetained: 80,
    separation: 1,
    sampleSizeChurned: 6,
    sampleSizeRetained: 40,
    ...over,
  };
}

const BACKTEST = {
  windowDays: 90,
  periodDays: 30,
  windowPeriods: 3,
  alertRiskThreshold: 41,
  periodsAnalyzed: 18,
  pairsAnalyzed: 900,
  clientsAnalyzed: 80,
  churnsAnalyzed: 22,
  churnsCaught: 17,
  truePositives: 38,
  falsePositives: 96,
  trueNegatives: 750,
  falseNegatives: 16,
  precision: 0.2836,
  recall: 0.7037,
  churnDetectionRate: 0.7727,
  falsePositiveRate: 0.1135,
  f1: 0.4043,
  leadTime: {
    meanPeriods: 4.2,
    medianPeriods: 4,
    meanDays: 126,
    medianDays: 120,
    sampleSize: 17,
  },
  topN: [
    { n: 5, slots: 90, hits: 21, precision: 0.2333, maxPrecision: 0.3 },
    { n: 10, slots: 180, hits: 30, precision: 0.1667, maxPrecision: 0.2 },
  ],
  churnOutcomes: [],
};

const RUN: CalibrationRunDto = {
  id: RUN_ID,
  metricModelVersionId: 'v-1',
  metricModelName: 'GlobalSys',
  version: 1,
  windowDays: 90,
  status: 'done',
  churnsAnalyzed: 22,
  churnsCaught: 17,
  precision: 0.2836,
  churnDetectionRate: 0.7727,
  errorMessage: null,
  createdAt: '2026-09-20T12:00:00.000Z',
  finishedAt: '2026-09-20T12:00:04.000Z',
  parameters: {
    windowDays: 90,
    periodDays: 30,
    windowPeriods: 3,
    alertRiskThreshold: 41,
    suggestionStrength: 0.5,
    minimumWeight: 0.01,
    topN: [5, 10],
  },
  results: {
    parameters: {
      windowDays: 90,
      periodDays: 30,
      windowPeriods: 3,
      alertRiskThreshold: 41,
      suggestionStrength: 0.5,
      minimumWeight: 0.01,
      topN: [5, 10],
    },
    baseline: BACKTEST,
    proposed: { ...BACKTEST, churnsCaught: 19, churnDetectionRate: 0.8636, precision: 0.31 },
    suggestions: [
      suggestion({
        metricId: SLA,
        metricName: 'Cumprimento de SLA',
        currentWeight: 0.12,
        suggestedWeight: 0.2,
        delta: 0.08,
        historicalImportance: 0.28,
      }),
      suggestion({
        metricId: USO,
        metricName: 'Uso da plataforma',
        currentWeight: 0.14,
        suggestedWeight: 0.1,
        delta: -0.04,
        historicalImportance: 0.06,
      }),
    ],
    model: {
      metricModelId: 'model-1',
      metricModelName: 'GlobalSys',
      metricModelVersionId: 'v-1',
      version: 1,
      status: 'active',
    },
  },
};

const fetchMock = vi.fn<typeof fetch>();
const aplicados: string[][] = [];

beforeEach(() => {
  fetchMock.mockReset();
  aplicados.length = 0;
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => {
  vi.unstubAllGlobals();
});

function mockApi(options: { runs?: boolean; runStatus?: number } = {}) {
  fetchMock.mockImplementation(async (input, init) => {
    const url = new URL(String(input));
    if (url.pathname === '/api/v1/calibration/versions') {
      return jsonResponse(200, {
        items: [
          {
            metricModelVersionId: 'v-1',
            metricModelName: 'GlobalSys',
            version: 1,
            status: 'active',
            snapshotCount: 1295,
          },
        ],
      });
    }
    if (url.pathname === '/api/v1/calibration/runs' && init?.method === 'POST') {
      if (options.runStatus !== undefined && options.runStatus >= 400) {
        return jsonResponse(options.runStatus, {
          error: {
            code: 'NO_HISTORY',
            message: 'Ainda não há histórico calculado para esta versão.',
          },
        });
      }
      return jsonResponse(201, RUN);
    }
    if (url.pathname === '/api/v1/calibration/runs') {
      return jsonResponse(200, {
        items: options.runs === false ? [] : [{ ...RUN, results: undefined }],
      });
    }
    if (url.pathname === `/api/v1/calibration/runs/${RUN_ID}`) {
      return jsonResponse(200, RUN);
    }
    if (url.pathname === `/api/v1/calibration/runs/${RUN_ID}/apply-suggestions`) {
      const body = JSON.parse(String(init?.body)) as { acceptedMetricIds: string[] };
      aplicados.push(body.acceptedMetricIds);
      return jsonResponse(201, {
        metricModelId: 'model-1',
        metricModelVersionId: 'v-2',
        version: 2,
        status: 'draft',
        weights: [],
        message: 'Rascunho v2 criado. Nada muda na carteira enquanto ninguém ativar esta versão.',
      });
    }
    throw new Error(`rota não esperada no teste: ${url.pathname}`);
  });
}

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={['/calibration']}>
        <Routes>
          <Route path="/calibration" element={<CalibrationPage />} />
          <Route path="/metric-models/:id" element={<p>tela do modelo</p>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

/** Região do modelo em vigor: os dois blocos de indicadores usam os mesmos rótulos. */
const emVigor = () => screen.getByRole('region', { name: /modelo em vigor/i });
const proposta = () => screen.getByRole('region', { name: /desempenho estimado da proposta/i });

async function rodar() {
  await userEvent.click(screen.getByRole('button', { name: /rodar backtest/i }));
  await screen.findByRole('region', { name: /modelo em vigor/i });
}

describe('tela de calibração', () => {
  it('explica o que é calibração antes de mostrar qualquer número', () => {
    mockApi({ runs: false });
    renderPage();

    expect(screen.getByRole('heading', { name: 'Calibração', level: 1 })).toBeInTheDocument();
    expect(screen.getByText(/palpite informado/i)).toBeInTheDocument();
    expect(screen.getByText(/você aprova ou recusa/i)).toBeInTheDocument();
    expect(screen.getByText(/rode o backtest/i)).toBeInTheDocument();
  });

  it('deixa escolher janela e versão', async () => {
    mockApi();
    renderPage();

    const janela = screen.getByLabelText(/janela de antecedência/i);
    expect(within(janela as HTMLSelectElement).getAllByRole('option')).toHaveLength(3);
    await userEvent.selectOptions(janela, '30');
    expect((janela as HTMLSelectElement).value).toBe('30');

    await waitFor(() =>
      expect(screen.getByRole('option', { name: /GlobalSys v1 \(em vigor\)/ })).toBeInTheDocument(),
    );
  });

  it('roda o backtest e mostra cada indicador com o que ele significa', async () => {
    mockApi();
    renderPage();
    await rodar();

    const bloco = within(emVigor());
    expect(bloco.getByText('22')).toBeInTheDocument();
    expect(bloco.getByText('77 %')).toBeInTheDocument();
    expect(bloco.getByText('28 %')).toBeInTheDocument();
    expect(bloco.getByText('4,2 meses')).toBeInTheDocument();
    expect(bloco.getByText(/23 % no top 5/)).toBeInTheDocument();
    expect(bloco.getByText(/teto do período/i)).toBeInTheDocument();
    expect(bloco.getByText(/de cada 100 alertas/i)).toBeInTheDocument();
    expect(bloco.getByText(/quanto tempo antes da saída/i)).toBeInTheDocument();
  });

  it('avisa que a base é pequena, com o número real de cancelamentos', async () => {
    mockApi();
    renderPage();
    await rodar();

    const aviso = screen.getByRole('note');
    expect(aviso).toHaveTextContent('22 cancelamentos na base');
    expect(aviso).toHaveTextContent(/não para decidir sozinhos/i);
  });

  it('mostra a tabela de pesos com atual, sugerido, importância e mudança', async () => {
    mockApi();
    renderPage();
    await rodar();

    const linha = document.querySelector(`[data-metric-id="${SLA}"]`);
    expect(linha).not.toBeNull();
    expect(within(linha as HTMLElement).getByText('12,0 %')).toBeInTheDocument();
    expect(within(linha as HTMLElement).getByText('20,0 %')).toBeInTheDocument();
    expect(within(linha as HTMLElement).getByText('28,0 %')).toBeInTheDocument();
    expect(within(linha as HTMLElement).getByText('+8,0 p.p.')).toBeInTheDocument();
  });

  it('desenha o slopegraph peso atual → sugerido, com tabela equivalente', async () => {
    mockApi();
    renderPage();
    await rodar();

    expect(
      screen.getByRole('img', { name: /peso atual e peso sugerido de cada métrica/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: /Cumprimento de SLA é a métrica que mais muda/i }),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /ver como tabela/i })).toBeInTheDocument();
  });

  it('aceitar uma, aceitar todas e manter os pesos atuais', async () => {
    mockApi();
    renderPage();
    await rodar();

    const linha = document.querySelector(`[data-metric-id="${SLA}"]`) as HTMLElement;
    await userEvent.click(within(linha).getByRole('button', { name: 'Aceitar' }));
    expect(screen.getByText('1 de 2 sugestões aceitas')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: /aceitar todas/i }));
    expect(screen.getByText('2 de 2 sugestões aceitas')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: /manter os pesos atuais/i }));
    expect(screen.getByText('nenhuma sugestão aceita')).toBeInTheDocument();
  });

  it('criar nova versão pede confirmação e deixa claro que nada muda até ativar', async () => {
    mockApi();
    renderPage();
    await rodar();

    const criar = screen.getByRole('button', { name: /criar nova versão/i });
    expect(criar).toBeDisabled();

    await userEvent.click(screen.getByRole('button', { name: /aceitar todas/i }));
    await userEvent.click(criar);

    const dialogo = screen.getByRole('dialog');
    expect(dialogo).toHaveTextContent(/nada muda na carteira agora/i);

    await userEvent.click(within(dialogo).getByRole('button', { name: /sim, criar o rascunho/i }));
    await waitFor(() => expect(aplicados).toEqual([[SLA, USO]]));
    expect(await screen.findByText(/enquanto ninguém ativar esta versão/i)).toBeInTheDocument();
  });

  it('compara o desempenho de hoje com o da proposta, com a ressalva', async () => {
    mockApi();
    renderPage();
    await rodar();

    const bloco = within(proposta());
    expect(
      bloco.getByRole('heading', { name: /se os pesos sugeridos já valessem/i }),
    ).toBeInTheDocument();
    expect(
      bloco.getByText(/tende a parecer melhor aqui do que seria no futuro/i),
    ).toBeInTheDocument();
    expect(bloco.getByText('86 %')).toBeInTheDocument();
    expect(within(emVigor()).getByText('77 %')).toBeInTheDocument();
  });

  it('mostra o histórico de execuções', async () => {
    mockApi();
    renderPage();
    await waitFor(() =>
      expect(screen.getByRole('heading', { name: /execuções anteriores/i })).toBeInTheDocument(),
    );
    const linha = await waitFor(() => {
      const found = document.querySelector(`[data-run-id="${RUN_ID}"]`);
      expect(found).not.toBeNull();
      return found as HTMLElement;
    });
    expect(within(linha).getByText('17 de 22')).toBeInTheDocument();
    expect(within(linha).getByText('90 dias')).toBeInTheDocument();
  });

  it('mostra a mensagem da API quando o backtest não pode rodar', async () => {
    mockApi({ runStatus: 400, runs: false });
    renderPage();
    await userEvent.click(screen.getByRole('button', { name: /rodar backtest/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      /não há histórico calculado para esta versão/i,
    );
  });
});
