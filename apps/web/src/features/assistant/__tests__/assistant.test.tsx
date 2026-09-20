/**
 * A aba Agente IA com a API dublada.
 *
 * O que estes testes protegem: a tela avisa quando a IA não está ligada em vez de quebrar; a
 * conversa acumula e o histórico vai junto da próxima pergunta; a resposta mostra de onde veio;
 * e o erro da API aparece para a pessoa em vez de sumir.
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { AssistantCanvas } from '@inovaapss/shared';

import { jsonResponse } from '@/features/auth/__tests__/fake-supabase';

import { AssistantPage } from '../AssistantPage';

// A página carrega Markdown e gráficos em chunks separados. Aqui testamos a orquestração da
// conversa e do canvas sem transformar Recharts/Streamdown em dependência de tempo destes testes.
vi.mock('../AssistantMessageContent', () => ({
  AssistantMessageContent: ({ content }: { content: string }) => <>{content}</>,
}));

vi.mock('../DecisionCanvas', () => ({
  DecisionCanvas: ({ canvas }: { canvas: AssistantCanvas }) => (
    <section>
      <h2>{canvas.title}</h2>
      <p>Dados verificados pelo motor</p>
      {canvas.widgets.flatMap((widget) =>
        widget.type === 'metrics'
          ? widget.items.map((item) => <p key={item.label}>{item.label}</p>)
          : [],
      )}
    </section>
  ),
}));

const STATUS_OK = { configured: true, model: 'gpt-4o-mini', canReadDocuments: true };

const ANSWER = {
  answer: 'Fale primeiro com a Alfa Ltda: está em Crítico, saúde 38,2 e MRR de BRL 12.000.',
  model: 'gpt-4o-mini',
  canvas: {
    preset: 'risk',
    title: 'Radar de risco e ação',
    summary: '2 críticos e 10 em risco; R$ 154 mil de MRR exigem atenção.',
    generatedAt: '2026-06-30',
    widgets: [
      {
        type: 'metrics',
        title: 'Sinais de risco agora',
        items: [
          {
            label: 'Clientes críticos',
            value: 2,
            delta: 1,
            format: 'integer',
            tone: 'critical',
          },
        ],
      },
    ],
  },
  context: { clientsInRanking: 12, periodEnd: '2026-06-30', documentName: null },
  usage: { promptTokens: 1200, completionTokens: 40 },
};

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={['/assistant']}>
        <AssistantPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

type Handler = (url: URL, init: RequestInit | undefined) => Response | undefined;

describe('aba Agente IA', () => {
  const fetchMock = vi.fn<typeof fetch>();
  let handler: Handler = () => undefined;

  const defaultHandler =
    (status: unknown = STATUS_OK): Handler =>
    (url) => {
      if (url.pathname === '/api/v1/assistant/status') return jsonResponse(200, status);
      if (url.pathname === '/api/v1/assistant/ask') return jsonResponse(200, ANSWER);
      if (url.pathname === '/api/v1/documents') {
        return jsonResponse(200, { items: [], page: 1, pageSize: 50, total: 0 });
      }
      return undefined;
    };

  const askBody = (): Record<string, unknown> | null => {
    const call = fetchMock.mock.calls.find(
      ([input]) => new URL(String(input)).pathname === '/api/v1/assistant/ask',
    );
    const body = call?.[1]?.body;
    return typeof body === 'string' ? (JSON.parse(body) as Record<string, unknown>) : null;
  };

  beforeEach(() => {
    fetchMock.mockReset();
    handler = defaultHandler();
    fetchMock.mockImplementation(async (input, init) => {
      const url = new URL(String(input));
      return (
        handler(url, init) ??
        jsonResponse(404, { error: { code: 'NOT_FOUND', message: `sem rota ${url.pathname}` } })
      );
    });
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('avisa e explica o que fazer quando a IA não está configurada', async () => {
    handler = defaultHandler({ configured: false, model: null, canReadDocuments: false });
    renderPage();

    expect(await screen.findByText('O Agente ainda não está ligado')).toBeInTheDocument();
    expect(screen.getByText(/OPENAI_API_KEY/)).toBeInTheDocument();
    expect(screen.getByText(/nunca chega ao navegador/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Perguntar/ })).not.toBeInTheDocument();
  });

  it('mostra o modelo e as perguntas iniciais quando está ligado', async () => {
    renderPage();

    expect(await screen.findByText('gpt-4o-mini')).toBeInTheDocument();
    expect(screen.getByText('Por onde começar')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Com quem eu preciso falar hoje, e por quê?' }),
    ).toBeInTheDocument();
  });

  it('pergunta pelo botão de sugestão e mostra a resposta com a origem', async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByText('Por onde começar');

    await user.click(
      screen.getByRole('button', { name: 'Com quem eu preciso falar hoje, e por quê?' }),
    );

    expect(await screen.findByText(/Fale primeiro com a Alfa Ltda/)).toBeInTheDocument();
    expect(screen.getByText(/Com base no relatório de 2026-06-30/)).toBeInTheDocument();
    expect(screen.getByText(/12 clientes no ranking/)).toBeInTheDocument();
    expect(await screen.findByText('Radar de risco e ação')).toBeInTheDocument();
    expect(screen.getByText('Dados verificados pelo motor')).toBeInTheDocument();
    expect(screen.getByText('Clientes críticos')).toBeInTheDocument();
    expect(askBody()).toMatchObject({
      question: 'Com quem eu preciso falar hoje, e por quê?',
      history: [],
    });
  });

  it('digita a pergunta e envia com Enter', async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByText('Por onde começar');

    await user.type(screen.getByLabelText('Sua pergunta'), 'Quanto MRR está em risco?{Enter}');

    expect(await screen.findByText(/Fale primeiro com a Alfa Ltda/)).toBeInTheDocument();
    expect(askBody()).toMatchObject({ question: 'Quanto MRR está em risco?' });
  });

  it('acumula a conversa e manda o histórico na pergunta seguinte', async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByText('Por onde começar');

    await user.type(screen.getByLabelText('Sua pergunta'), 'Quem é o primeiro?{Enter}');
    await screen.findByText(/Fale primeiro com a Alfa Ltda/);
    await user.type(screen.getByLabelText('Sua pergunta'), 'E o segundo?{Enter}');

    await waitFor(() => {
      const asks = fetchMock.mock.calls.filter(
        ([input]) => new URL(String(input)).pathname === '/api/v1/assistant/ask',
      );
      expect(asks).toHaveLength(2);
      const body = JSON.parse(String(asks[1]?.[1]?.body)) as { history: unknown[] };
      expect(body.history).toEqual([
        { role: 'user', content: 'Quem é o primeiro?' },
        { role: 'assistant', content: ANSWER.answer },
      ]);
    });

    const conversa = within(screen.getByRole('list', { name: 'Conversa com o Agente' }));
    expect(conversa.getByText('Quem é o primeiro?')).toBeInTheDocument();
    expect(conversa.getByText('E o segundo?')).toBeInTheDocument();
  });

  it('não envia pergunta curta demais', async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByText('Por onde começar');

    await user.type(screen.getByLabelText('Sua pergunta'), 'oi');

    expect(screen.getByRole('button', { name: /Perguntar/ })).toBeDisabled();
  });

  it('mostra o erro da API sem perder a conversa', async () => {
    handler = (url) => {
      if (url.pathname === '/api/v1/assistant/ask') {
        return jsonResponse(502, {
          error: { code: 'OPENAI_ERROR', message: 'A OpenAI está indisponível no momento.' },
        });
      }
      return defaultHandler()(url, undefined);
    };
    const user = userEvent.setup();
    renderPage();
    await screen.findByText('Por onde começar');

    await user.type(screen.getByLabelText('Sua pergunta'), 'Como está a carteira?{Enter}');

    expect(await screen.findByRole('alert')).toHaveTextContent('A OpenAI está indisponível');
    // A pergunta continua na tela: a pessoa não perde o que escreveu na conversa.
    const conversa = within(screen.getByRole('list', { name: 'Conversa com o Agente' }));
    expect(conversa.getByText('Como está a carteira?')).toBeInTheDocument();
  });

  it('oferece escolher um documento quando existem documentos', async () => {
    handler = (url) => {
      if (url.pathname === '/api/v1/documents') {
        return jsonResponse(200, {
          items: [{ id: 'doc-1', fileName: 'politica-sla.pdf' }],
          page: 1,
          pageSize: 50,
          total: 1,
        });
      }
      return defaultHandler()(url, undefined);
    };
    const user = userEvent.setup();
    renderPage();

    const select = await screen.findByLabelText(/Considerar um documento/);
    await user.selectOptions(select, 'doc-1');
    await user.type(screen.getByLabelText('Sua pergunta'), 'O que diz o SLA?{Enter}');

    await waitFor(() => {
      expect(askBody()).toMatchObject({ documentId: 'doc-1', question: 'O que diz o SLA?' });
    });
  });
});
