import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router';
import { describe, expect, it } from 'vitest';

import { distributionTitle, forecastTitle } from '@/components/charts/titles';
import { buildMockGeneralDashboard, buildMockRiskDashboard } from '@/lib/mock/dashboard';

import { DashboardPage } from './DashboardPage';
import { criticalBandHint, priorityFormulaText, riskBandHint } from './format';
import { GeneralTab } from './GeneralTab';
import { RankingTable } from './RankingTable';
import { RiskTab } from './RiskTab';

import type { ReactNode } from 'react';

const LAZY_TIMEOUT = { timeout: 15_000 };
// O primeiro import do Recharts num chunk lazy demora; os testes de tela ganham folga.
const TEST_TIMEOUT = 30_000;

function renderWithProviders(ui: ReactNode, path = '/dashboard') {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/dashboard" element={ui} />
          <Route path="/clients/:id" element={<ClientStub />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

function ClientStub() {
  return <p>Página do cliente</p>;
}

function tableClientRows(): HTMLElement[] {
  return Array.from(document.querySelectorAll<HTMLElement>('tbody tr[data-client-id]'));
}

describe('aba Em risco', () => {
  const mock = buildMockRiskDashboard();

  it(
    'mostra os 4 KPIs em texto simples com o valor do mock',
    async () => {
      renderWithProviders(<RiskTab />);

      const kpis = (await screen.findByText('Clientes ativos', undefined, LAZY_TIMEOUT)).closest(
        'dl',
      )!;
      expect(kpis).toHaveAttribute('aria-label', 'Resumo da carteira');
      expect(within(kpis).getByText(String(mock.kpis.activeClients.value))).toBeInTheDocument();
      expect(within(kpis).getByText('Saúde crítica')).toBeInTheDocument();
      expect(within(kpis).getByText('Saúde em risco')).toBeInTheDocument();
      expect(within(kpis).getByText('Receita em risco')).toBeInTheDocument();
      // As faixas dos KPIs e a fórmula do ranking vêm do payload, não de números fixos (§65).
      const { thresholds } = mock.forecast;
      expect(within(kpis).getByText(criticalBandHint(thresholds))).toBeInTheDocument();
      expect(within(kpis).getByText(riskBandHint(thresholds))).toBeInTheDocument();
      const formula = priorityFormulaText(mock.priorityWeights);
      expect(screen.getByText((text) => text.startsWith(formula))).toBeInTheDocument();
    },
    TEST_TIMEOUT,
  );

  it(
    'explica saúde atual, saúde projetada e risco de cancelamento sem tratá-lo como porcentagem',
    async () => {
      renderWithProviders(<RiskTab />);

      const guideTitle = await screen.findByRole(
        'heading',
        { name: 'O que significa cada número' },
        LAZY_TIMEOUT,
      );
      const guide = guideTitle.closest('section')!;
      expect(within(guide).getByRole('heading', { name: 'Saúde atual' })).toBeInTheDocument();
      expect(within(guide).getByRole('heading', { name: 'Saúde projetada' })).toBeInTheDocument();
      expect(
        within(guide).getByRole('heading', { name: 'Risco de cancelamento' }),
      ).toBeInTheDocument();
      expect(
        within(guide).getByText(/É um score de atenção, não a porcentagem/),
      ).toBeInTheDocument();
      expect(within(guide).getByText(/100 − saúde atual/)).toBeInTheDocument();
      expect(within(guide).getByText('Confiança dos dados')).toBeInTheDocument();
      expect(within(guide).getByText('Confiança da projeção')).toBeInTheDocument();
    },
    TEST_TIMEOUT,
  );

  it(
    'desenha o forecast com as 10 primeiras linhas ordenadas por prioridade e o título dinâmico',
    async () => {
      renderWithProviders(<RiskTab />);

      // O mock foi desenhado para ter cruzamentos: o título afirma o "e daí?".
      expect(mock.forecast.crossingCount).toBeGreaterThan(1);
      const expectedTitle = forecastTitle(mock.forecast);
      expect(expectedTitle).toBe(
        `${mock.forecast.crossingCount} clientes devem cruzar para Risco ou Crítico no próximo período`,
      );
      expect(
        await screen.findByRole('heading', { name: expectedTitle }, LAZY_TIMEOUT),
      ).toBeInTheDocument();
      expect(
        screen.getByText(/projeção pela tendência .* não é chance de cancelamento/i),
      ).toBeInTheDocument();

      const chart = screen.getByRole('list', { name: /clientes ordenados por prioridade/i });
      const items = within(chart).getAllByRole('listitem');
      expect(items).toHaveLength(10);
      const expectedNames = mock.forecast.rows.slice(0, 10).map((row) => row.clientName);
      items.forEach((item, index) => {
        expect(item).toHaveAttribute(
          'aria-label',
          expect.stringMatching(`^#${index + 1} ${expectedNames[index]}`),
        );
      });
      // A prioridade decresce linha a linha.
      const scores = mock.forecast.rows.slice(0, 10).map((row) => row.priorityScore);
      expect([...scores].sort((a, b) => b - a)).toEqual(scores);

      // "Mostrar mais" abre até 25 linhas.
      await userEvent.click(screen.getByRole('button', { name: /mostrar mais/i }));
      expect(within(chart).getAllByRole('listitem')).toHaveLength(
        Math.min(25, mock.forecast.rows.length),
      );
    },
    TEST_TIMEOUT,
  );

  it(
    'leva a /clients/:id ao clicar numa linha do gráfico',
    async () => {
      renderWithProviders(<RiskTab />);

      const chart = await screen.findByRole(
        'list',
        { name: /clientes ordenados por prioridade/i },
        LAZY_TIMEOUT,
      );
      await userEvent.click(within(chart).getAllByRole('listitem')[0]!);

      expect(await screen.findByText('Página do cliente')).toBeInTheDocument();
    },
    TEST_TIMEOUT,
  );

  it(
    'não oferece busca nem filtros: a lista é fixa',
    async () => {
      renderWithProviders(<RiskTab />);
      await screen.findByRole('list', { name: /clientes ordenados por prioridade/i }, LAZY_TIMEOUT);

      expect(screen.queryByLabelText('Buscar cliente')).not.toBeInTheDocument();
      expect(screen.queryByLabelText('Classe de saúde')).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Limpar filtros' })).not.toBeInTheDocument();
      expect(tableClientRows()).toHaveLength(mock.ranking.length);
    },
    TEST_TIMEOUT,
  );
});

describe('textos derivados da configuração (§7, §28, §65)', () => {
  it('faixas de health e pesos da prioridade seguem a organização, não os padrões', () => {
    const custom = { attention: 85, risk: 65, critical: 45 };
    expect(criticalBandHint(custom)).toBe('saúde abaixo de 45');
    expect(riskBandHint(custom)).toBe('saúde de 45 a 64');
    expect(priorityFormulaText({ risk: 0.6, impact: 0.4 })).toBe(
      'Prioridade = risco de cancelamento × 0,6 + impacto comercial × 0,4',
    );
    // Com os padrões (80/60/40 e 0,7/0,3) o texto continua o de sempre.
    expect(criticalBandHint({ attention: 80, risk: 60, critical: 40 })).toBe(
      'saúde abaixo de 40',
    );
    expect(riskBandHint({ attention: 80, risk: 60, critical: 40 })).toBe('saúde de 40 a 59');
    expect(priorityFormulaText({ risk: 0.7, impact: 0.3 })).toBe(
      'Prioridade = risco de cancelamento × 0,7 + impacto comercial × 0,3',
    );
  });
});

describe('tabela de ranking', () => {
  const mock = buildMockRiskDashboard();

  it('é uma lista fixa na ordem de prioridade, sem reordenar pelos cabeçalhos', () => {
    render(<RankingTable rows={mock.ranking} onSelect={() => {}} />);

    const names = tableClientRows().map((row) => row.getAttribute('data-client-id'));
    expect(names).toEqual(mock.ranking.map((row) => row.clientId));
    expect(tableClientRows()[0]).toHaveTextContent(mock.ranking[0]!.clientName);

    // Cabeçalhos são só texto: nada de botão de ordenação.
    expect(screen.queryByRole('button', { name: 'Valor mensal' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Cliente' })).not.toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: /valor mensal/i })).not.toHaveAttribute(
      'aria-sort',
    );
  });

  it('distingue saúde, risco, confiança dos dados e ação sugerida', () => {
    render(<RankingTable rows={mock.ranking.slice(0, 1)} onSelect={() => {}} />);
    const row = tableClientRows()[0]!;
    const first = mock.ranking[0]!;

    expect(row).toHaveTextContent(`${first.healthCurrent}/100`);
    expect(row).toHaveTextContent(`${first.riskScore}/100`);
    expect(row).toHaveTextContent(/Saúde normal|Saúde em atenção|Saúde em risco|Saúde crítica/);
    expect(row).toHaveTextContent(`${first.confidence} %`);
    expect(row).toHaveTextContent(first.suggestedAction);
    expect(
      within(row).getByRole('button', { name: `Analisar ${first.clientName}` }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('columnheader', { name: /Saúde atual maior é melhor/ }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('columnheader', { name: /Risco de cancelamento score, não %/ }),
    ).toBeInTheDocument();
  });
});

describe('aba Geral', () => {
  const mock = buildMockGeneralDashboard();

  it(
    'mostra a distribuição por classe em barras com o título do "e daí?" e a tabela irmã',
    async () => {
      renderWithProviders(<GeneralTab />);

      const title = distributionTitle(mock.distribution);
      expect(await screen.findByRole('heading', { name: title }, LAZY_TIMEOUT)).toBeInTheDocument();
      expect(screen.getByText('Cancelados')).toBeInTheDocument();

      const figure = screen.getByRole('figure', { name: title });
      await userEvent.click(within(figure).getByRole('button', { name: 'Ver como tabela' }));
      for (const item of mock.distribution) {
        expect(
          within(figure).getByRole('row', { name: new RegExp(`^${labelOf(item.healthClass)} `) }),
        ).toBeInTheDocument();
      }

      expect(screen.queryByRole('group', { name: 'Filtros' })).not.toBeInTheDocument();
      expect(screen.queryByLabelText('Classe de saúde')).not.toBeInTheDocument();
      expect(screen.queryByLabelText('Classe de prioridade')).not.toBeInTheDocument();
      expect(
        screen.queryByLabelText('Destacar cliente na evolução temporal'),
      ).not.toBeInTheDocument();
    },
    TEST_TIMEOUT,
  );
});

function labelOf(healthClass: string): string {
  return (
    { NORMAL: 'Normal', ATTENTION: 'Atenção', RISK: 'Risco', CRITICAL: 'Crítico' }[healthClass] ??
    healthClass
  );
}

describe('página do dashboard', () => {
  it(
    'alterna entre as abas Em risco e Geral',
    async () => {
      renderWithProviders(<DashboardPage />);

      expect(
        await screen.findByText('Clientes ativos', undefined, LAZY_TIMEOUT),
      ).toBeInTheDocument();
      await userEvent.click(screen.getByRole('tab', { name: 'Geral' }));
      expect(await screen.findByText('Cancelados', undefined, LAZY_TIMEOUT)).toBeInTheDocument();
    },
    TEST_TIMEOUT,
  );
});

describe('guarda do ajuste A1', () => {
  it('nenhum arquivo do web importa gráfico de pizza', () => {
    const sources = import.meta.glob('/src/**/*.{ts,tsx}', {
      query: '?raw',
      import: 'default',
      eager: true,
    }) as Record<string, string>;
    const forbidden = ['Pie' + 'Chart', 'Radial' + 'BarChart'];
    const offenders = Object.entries(sources)
      .filter(([file]) => !file.endsWith('dashboard.test.tsx'))
      .filter(([, content]) => forbidden.some((token) => content.includes(token)))
      .map(([file]) => file);
    expect(Object.keys(sources).length).toBeGreaterThan(10);
    expect(offenders).toEqual([]);
  });
});
