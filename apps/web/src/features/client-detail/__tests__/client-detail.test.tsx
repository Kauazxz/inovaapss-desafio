import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router';
import { describe, expect, it } from 'vitest';

import { HEALTH_CLASS_LABELS, PRIORITY_CLASS_LABELS } from '@inovaapss/shared';

import {
  buildMockClientHistory,
  buildMockClientOverview,
  buildMockClientScores,
} from '@/lib/mock/client-detail';

import { ClientDetailPage } from '../ClientDetailPage';
import { metricScoresTitle } from '../titles';

const LAZY_TIMEOUT = { timeout: 15_000 };
// O primeiro import do Recharts num chunk lazy demora; os testes de tela ganham folga.
const TEST_TIMEOUT = 30_000;

function renderAt(path: string) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/dashboard" element={<p>Página do dashboard</p>} />
          <Route path="/clients" element={<p>Página de clientes</p>} />
          <Route path="/clients/:id" element={<ClientDetailPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('cabeçalho §40', () => {
  const overview = buildMockClientOverview('mock-alfa')!;
  const score = overview.score!;

  it(
    'mostra nome, plano, contrato, MRR, health com classe, risk, prioridade e confiança do mock',
    async () => {
      renderAt('/clients/mock-alfa');

      expect(
        await screen.findByRole('heading', { name: overview.client.name }, LAZY_TIMEOUT),
      ).toBeInTheDocument();
      const resumo = within(screen.getByLabelText('Resumo do cliente'));
      expect(resumo.getByText(overview.plan!.name)).toBeInTheDocument();
      expect(resumo.getByText(overview.contract!.code)).toBeInTheDocument();
      expect(resumo.getByText('R$ 12.000')).toBeInTheDocument();
      // Health nunca vai só com o número: classe e variação ao lado (§58).
      expect(resumo.getByText(`${score.overallHealth}/100`)).toBeInTheDocument();
      expect(resumo.getAllByText(HEALTH_CLASS_LABELS[score.healthClass!]).length).toBeGreaterThan(
        0,
      );
      expect(resumo.getByText(/caiu 5 pontos vs\. ago\/26/)).toBeInTheDocument();
      expect(resumo.getByText(`${score.riskScore}/100`)).toBeInTheDocument();
      expect(resumo.getByText(`${score.priorityScore}/100`)).toBeInTheDocument();
      expect(resumo.getByText(PRIORITY_CLASS_LABELS[score.priorityClass!])).toBeInTheDocument();
      expect(resumo.getByText(`${score.analysisConfidence} %`)).toBeInTheDocument();
      expect(resumo.getByText(/10 de 10 métricas avaliadas/)).toBeInTheDocument();
    },
    TEST_TIMEOUT,
  );

  it(
    'tem breadcrumb com Dashboard e Clientes e o botão de voltar',
    async () => {
      renderAt('/clients/mock-alfa');
      const crumbs = await screen.findByRole('navigation', { name: 'Você está em' }, LAZY_TIMEOUT);
      expect(within(crumbs).getByRole('link', { name: 'Dashboard' })).toHaveAttribute(
        'href',
        '/dashboard',
      );
      expect(within(crumbs).getByRole('link', { name: 'Clientes' })).toHaveAttribute(
        'href',
        '/clients',
      );
      expect(within(crumbs).getByText(overview.client.name)).toHaveAttribute(
        'aria-current',
        'page',
      );

      // Sem histórico de navegação, "Voltar" leva ao dashboard.
      await userEvent.click(screen.getByRole('button', { name: 'Voltar' }));
      expect(await screen.findByText('Página do dashboard')).toBeInTheDocument();
    },
    TEST_TIMEOUT,
  );

  it(
    'diz que o cliente não existe e oferece o caminho de volta',
    async () => {
      renderAt('/clients/nao-existe');
      expect(
        await screen.findByRole('heading', { name: 'Cliente não encontrado' }, LAZY_TIMEOUT),
      ).toBeInTheDocument();
      expect(screen.getByRole('link', { name: 'Voltar para o dashboard' })).toHaveAttribute(
        'href',
        '/dashboard',
      );
    },
    TEST_TIMEOUT,
  );
});

describe('aba Visão geral', () => {
  const overview = buildMockClientOverview('mock-alfa')!;
  const scores = buildMockClientScores('mock-alfa')!;

  it(
    'mostra o resumo §58 em texto com os drivers numerados',
    async () => {
      renderAt('/clients/mock-alfa');
      const resumo = await screen.findByRole('region', { name: 'Resumo' }, LAZY_TIMEOUT);
      expect(
        within(resumo).getByText(`Health: ${overview.score!.overallHealth}/100 — Crítico`),
      ).toBeInTheDocument();
      expect(
        within(resumo).getByText(`Risk: ${overview.score!.riskScore}/100`),
      ).toBeInTheDocument();
      expect(
        within(resumo).getByText(`Confiança: ${overview.score!.analysisConfidence} %`),
      ).toBeInTheDocument();
      const drivers = within(resumo).getByRole('list', { name: 'Principais drivers' });
      const items = within(drivers).getAllByRole('listitem');
      expect(items.length).toBeGreaterThanOrEqual(1);
      expect(items.length).toBeLessThanOrEqual(4);
      expect(items[0]).toHaveTextContent('1. Chamados críticos +180 % em 3 meses.');
    },
    TEST_TIMEOUT,
  );

  it(
    'desenha os 10 scores em barras ordenadas do pior para o melhor, com peso e contribuição',
    async () => {
      renderAt('/clients/mock-alfa');
      const title = metricScoresTitle(scores.items, overview.score!.riskScore);
      const figure = await screen.findByRole('figure', { name: title }, LAZY_TIMEOUT);

      await userEvent.click(within(figure).getByRole('button', { name: 'Ver como tabela' }));
      const rows = within(figure).getAllByRole('row').slice(1); // sem o cabeçalho
      const evaluated = scores.items.filter((item) => item.metricHealth !== null);
      expect(rows).toHaveLength(evaluated.length);
      expect(rows.length + scores.items.filter((item) => item.metricHealth === null).length).toBe(
        10,
      );

      const expectedOrder = [...evaluated]
        .sort((a, b) => a.metricHealth! - b.metricHealth!)
        .map((item) => item.metricName);
      rows.forEach((row, index) => {
        expect(row).toHaveTextContent(expectedOrder[index]!);
        expect(row).toHaveTextContent(
          `${Math.round(evaluated.find((i) => i.metricName === expectedOrder[index])!.metricHealth!)}/100`,
        );
        expect(row).toHaveTextContent(/peso \d+ %/);
        expect(row).toHaveTextContent(/tira [\d,]+ pontos/);
      });
    },
    TEST_TIMEOUT,
  );

  it(
    'lista recomendações com playbook e status, e reserva a seção de contratos',
    async () => {
      renderAt('/clients/mock-alfa');
      const list = await screen.findByRole('list', { name: 'Recomendações' }, LAZY_TIMEOUT);
      const first = within(list).getAllByRole('listitem')[0]!;
      expect(first).toHaveTextContent(
        'Abrir sala de crise com o time técnico e revisar os chamados críticos',
      );
      expect(first).toHaveTextContent('Pendente');
      expect(document.querySelector('section#contratos')).not.toBeNull();
    },
    TEST_TIMEOUT,
  );
});

describe('abas de dimensão', () => {
  it(
    'troca de aba pelo teclado/clique e reflete na URL (?tab=)',
    async () => {
      renderAt('/clients/mock-alfa');
      const tabs = await screen.findByRole('tablist', { name: 'Seções do cliente' }, LAZY_TIMEOUT);
      expect(within(tabs).getAllByRole('tab')).toHaveLength(8);
      expect(within(tabs).getByRole('tab', { name: 'Visão geral' })).toHaveAttribute(
        'aria-selected',
        'true',
      );

      await userEvent.click(within(tabs).getByRole('tab', { name: 'Uso' }));
      expect(within(tabs).getByRole('tab', { name: 'Uso' })).toHaveAttribute(
        'aria-selected',
        'true',
      );
      expect(
        (await screen.findAllByRole('heading', { name: /Uso/ }, LAZY_TIMEOUT)).length,
      ).toBeGreaterThan(0);

      await userEvent.click(within(tabs).getByRole('tab', { name: 'SLA' }));
      expect((await screen.findAllByRole('heading', { name: /SLA/ }, LAZY_TIMEOUT)).length).toBe(2);
    },
    TEST_TIMEOUT,
  );

  it(
    'NPS mostra "não respondeu" como estado, nunca como zero (§22)',
    async () => {
      renderAt('/clients/mock-mangue?tab=nps');
      const list = await screen.findByRole(
        'list',
        { name: 'Respostas por trimestre' },
        LAZY_TIMEOUT,
      );
      const items = within(list).getAllByRole('listitem');
      expect(items).toHaveLength(4);
      for (const item of items) {
        expect(item).toHaveTextContent('não respondeu');
        expect(item).not.toHaveTextContent('0 / 10');
      }
      expect(
        screen.getByRole('heading', { name: /Não respondeu nenhuma das 4 pesquisas/ }),
      ).toBeInTheDocument();
    },
    TEST_TIMEOUT,
  );

  it(
    'Reuniões mostra N/A quando não havia reunião prevista (§21)',
    async () => {
      renderAt('/clients/mock-gama?tab=meetings');
      const list = await screen.findByRole(
        'list',
        { name: 'Reuniões previstas e realizadas por período' },
        LAZY_TIMEOUT,
      );
      const items = within(list).getAllByRole('listitem');
      expect(items).toHaveLength(6);
      for (const item of items) {
        expect(item).toHaveTextContent('N/A — sem reunião prevista no período');
      }
      expect(
        screen.getByRole('heading', { name: 'N/A — nenhuma reunião prevista no período' }),
      ).toBeInTheDocument();
    },
    TEST_TIMEOUT,
  );

  it(
    'Histórico renderiza a timeline com todos os eventos do mock',
    async () => {
      const history = buildMockClientHistory('mock-alfa')!;
      renderAt('/clients/mock-alfa?tab=history');
      const list = await screen.findByRole('list', { name: 'Eventos do cliente' }, LAZY_TIMEOUT);
      const items = within(list).getAllByRole('listitem');
      expect(items).toHaveLength(history.events.length);
      expect(items[0]).toHaveTextContent(history.events[0]!.title);
      expect(within(list).getByText(/^Passou de /)).toBeInTheDocument();
      expect(within(list).getByText(/GlobalSys v1 ativado/)).toBeInTheDocument();
    },
    TEST_TIMEOUT,
  );
});

describe('guarda do ajuste A1', () => {
  it('a visão do cliente não usa gráfico de pizza nem rosca', () => {
    const sources = import.meta.glob(
      ['/src/features/client-detail/**/*.{ts,tsx}', '/src/lib/mock/client-detail.ts'],
      { query: '?raw', import: 'default', eager: true },
    ) as Record<string, string>;
    const forbidden = ['Pie' + 'Chart', 'Radial' + 'BarChart', '<' + 'Pie'];
    const offenders = Object.entries(sources)
      .filter(([file]) => !file.endsWith('client-detail.test.tsx'))
      .filter(([, content]) => forbidden.some((token) => content.includes(token)))
      .map(([file]) => file);
    expect(Object.keys(sources).length).toBeGreaterThan(10);
    expect(offenders).toEqual([]);
  });
});
