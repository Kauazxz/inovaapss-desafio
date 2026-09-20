/**
 * A tela /import: o caminho feliz (arquivo → colunas → conferência → resultado), o que ela
 * recusa antes de chamar a API e o que ela bloqueia quando falta coluna obrigatória.
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type {
  ImportConfirmDto,
  ImportJobDto,
  ImportPreviewDto,
  ImportUploadDto,
} from '@inovaapss/shared';

import { jsonResponse } from '@/features/auth/__tests__/fake-supabase';

import { ImportDataButton } from '../ImportDataButton';
import { ImportPage } from '../ImportPage';

const JOB: ImportJobDto = {
  id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  organizationId: 'org-1',
  fileName: 'base.xlsx',
  fileType: 'XLSX',
  sizeBytes: 24_576,
  status: 'uploaded',
  mapping: null,
  summary: null,
  error: null,
  createdBy: 'user-1',
  createdAt: '2026-09-20T12:00:00.000Z',
  finishedAt: null,
};

const UPLOAD: ImportUploadDto = {
  job: JOB,
  sheets: [
    {
      name: 'clientes',
      headers: ['cliente_id', 'segmento', 'porte', 'plano', 'valor_mensal'],
      rowCount: 80,
      sample: [{ cliente_id: 'C001', segmento: 'Varejo' }],
      detectedDataset: 'clients',
      detectionConfidence: 1,
    },
    {
      name: 'Leia-me',
      headers: ['instrucoes'],
      rowCount: 1,
      sample: [],
      detectedDataset: null,
      detectionConfidence: 0,
    },
  ],
};

const PREVIEW: ImportPreviewDto = {
  job: { ...JOB, status: 'previewed' },
  sheets: [
    {
      sheet: 'clientes',
      dataset: 'clients',
      mapping: {
        external_code: 'cliente_id',
        name: null,
        segment: 'segmento',
        size: 'porte',
        plan: 'plano',
        monthly_value: 'valor_mensal',
        contracted_sla_hours: 'sla_contratado_h',
        contract_start: 'inicio_contrato',
      },
      mappingSource: 'preset',
      fields: [
        {
          field: 'external_code',
          label: 'Código do cliente',
          required: true,
          type: 'text',
          description: null,
          header: 'cliente_id',
          confidence: 0.95,
          reason: 'synonym',
        },
        {
          field: 'segment',
          label: 'Segmento',
          required: true,
          type: 'text',
          description: null,
          header: 'segmento',
          confidence: 1,
          reason: 'exact',
        },
      ],
      unmappedHeaders: [],
      counts: { total: 80, valid: 78, invalid: 2, duplicates: 0, missingFields: [] },
      sample: [],
      errors: [
        {
          row: 17,
          sheet: 'clientes',
          dataset: 'clients',
          field: 'monthly_value',
          code: 'MISSING_REQUIRED',
          message: 'Valor mensal é obrigatório.',
        },
      ],
    },
  ],
  skipped: [
    { sheet: 'Leia-me', reason: 'Os cabeçalhos não correspondem a nenhum conjunto de dados.' },
  ],
  counts: { total: 80, valid: 78, invalid: 2, duplicates: 0, missingFields: [] },
  errorCount: 2,
};

const CONFIRM: ImportConfirmDto = {
  job: { ...JOB, status: 'confirmed', finishedAt: '2026-09-20T12:05:00.000Z' },
  result: {
    plansCreated: 3,
    clientsCreated: 78,
    clientsUpdated: 0,
    clientsCancelled: 22,
    contractsCreated: 78,
    contractsUpdated: 0,
    metricValues: 12_077,
    rowErrors: 2,
    skipped: [],
    recalculation: { clients: 78, clientSnapshots: 1295, metricSnapshots: 12_950, alerts: 46 },
  },
};

const EMPTY_HISTORY = { items: [], page: 1, pageSize: 20, total: 0 };

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={['/import']}>
        <Routes>
          <Route path="/import" element={<ImportPage />} />
          <Route path="/dashboard" element={<p>Dashboard</p>} />
          <Route path="/clients" element={<p>Clientes</p>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

type Handler = (url: URL, init: RequestInit | undefined) => Response | undefined;

const xlsx = () =>
  new File(['PK\u0003\u0004conteudo'], 'base.xlsx', {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });

describe('feature import', () => {
  const fetchMock = vi.fn<typeof fetch>();
  let handler: Handler = () => undefined;
  const calls = () =>
    fetchMock.mock.calls.map(
      ([input, init]) => `${init?.method ?? 'GET'} ${new URL(String(input)).pathname}`,
    );

  beforeEach(() => {
    fetchMock.mockReset();
    fetchMock.mockImplementation(async (input, init) => {
      const url = new URL(String(input));
      if (url.pathname === '/api/v1/imports' && (init?.method ?? 'GET') === 'GET') {
        return jsonResponse(200, EMPTY_HISTORY);
      }
      return (
        handler(url, init) ??
        jsonResponse(404, {
          error: { code: 'NOT_FOUND', message: `sem rota para ${url.pathname}` },
        })
      );
    });
    vi.stubGlobal('fetch', fetchMock);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('mostra os passos e começa pelo envio do arquivo', async () => {
    renderPage();
    const passos = screen.getByRole('list', { name: 'Passos da importação' });
    expect(within(passos).getByText('1. Arquivo')).toBeInTheDocument();
    expect(within(passos).getByText('4. Resultado')).toBeInTheDocument();
    expect(screen.getByRole('group', { name: 'Enviar arquivo de dados' })).toBeInTheDocument();
    expect(screen.getByText(/Aceitos: XLSX, CSV e JSON/)).toBeInTheDocument();
    expect(await screen.findByText(/Nenhuma importação ainda/)).toBeInTheDocument();
  });

  it('recusa no navegador um arquivo fora da allowlist, sem chamar a API', async () => {
    renderPage();
    const input = screen.getByLabelText('Escolher arquivo');
    const pdf = new File(['%PDF'], 'contrato.pdf', { type: 'application/pdf' });
    await userEvent.upload(input, pdf, { applyAccept: false });

    const alerta = await screen.findByRole('alert');
    expect(alerta).toHaveTextContent('contrato.pdf');
    expect(alerta).toHaveTextContent(/Extensão não aceita/);
    expect(calls().filter((call) => call.startsWith('POST'))).toEqual([]);
  });

  it('arquivo → colunas → conferência → resultado', async () => {
    handler = (url, init) => {
      if (url.pathname === '/api/v1/imports' && init?.method === 'POST') {
        return jsonResponse(201, UPLOAD);
      }
      if (url.pathname === `/api/v1/imports/${JOB.id}/preview`) return jsonResponse(200, PREVIEW);
      if (url.pathname === `/api/v1/imports/${JOB.id}/confirm`) return jsonResponse(200, CONFIRM);
      return undefined;
    };
    renderPage();

    // 1. arquivo
    await userEvent.upload(screen.getByLabelText('Escolher arquivo'), xlsx());

    // 2. colunas: a aba reconhecida já vem escolhida; a de texto, não.
    expect(await screen.findByText('O que há no arquivo')).toBeInTheDocument();
    expect(screen.getByText('base.xlsx · 24 kB · 2 tabelas')).toBeInTheDocument();
    expect(screen.getByLabelText('Conjunto de dados da tabela clientes')).toHaveValue('clients');
    expect(screen.getByLabelText('Conjunto de dados da tabela Leia-me')).toHaveValue('');

    await userEvent.click(screen.getByRole('button', { name: /conferir antes de importar/i }));

    // 3. conferência: as quatro contagens da §34 e os erros por linha.
    expect(await screen.findByText('Linhas lidas')).toBeInTheDocument();
    const porTabela = screen.getByRole('table', { name: 'Contagens por tabela' });
    const linhaClientes = within(porTabela).getAllByRole('row')[1]!;
    expect(within(linhaClientes).getByText('80')).toBeInTheDocument();
    expect(within(linhaClientes).getByText('78')).toBeInTheDocument();
    expect(screen.getByText('Valor mensal é obrigatório.')).toBeInTheDocument();
    expect(screen.getByText(/Leia-me/)).toBeInTheDocument();
    const mapeamento = screen.getByRole('table', { name: 'Mapeamento da tabela clientes' });
    expect(within(mapeamento).getByLabelText('Coluna para Código do cliente')).toHaveValue(
      'cliente_id',
    );

    // 4. resultado
    await userEvent.click(screen.getByRole('button', { name: /importar 78 linhas/i }));
    expect(await screen.findByText('Importação concluída')).toBeInTheDocument();
    expect(screen.getByText(/78 clientes novos/)).toBeInTheDocument();
    expect(screen.getByText(/Scores recalculados para 78 clientes/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Ver o dashboard' })).toHaveAttribute(
      'href',
      '/dashboard',
    );
    expect(screen.getByRole('link', { name: 'Ver os clientes' })).toHaveAttribute(
      'href',
      '/clients',
    );

    expect(calls()).toContain(`POST /api/v1/imports/${JOB.id}/confirm`);
  });

  it('campo obrigatório sem coluna bloqueia a importação', async () => {
    const semColuna: ImportPreviewDto = {
      ...PREVIEW,
      sheets: [
        {
          ...PREVIEW.sheets[0]!,
          fields: [
            {
              ...PREVIEW.sheets[0]!.fields[0]!,
              header: null,
              confidence: 0,
              reason: 'none',
            },
          ],
          counts: { ...PREVIEW.sheets[0]!.counts, missingFields: ['external_code'] },
        },
      ],
      counts: { ...PREVIEW.counts, missingFields: ['external_code'] },
    };
    handler = (url, init) => {
      if (url.pathname === '/api/v1/imports' && init?.method === 'POST') {
        return jsonResponse(201, UPLOAD);
      }
      if (url.pathname === `/api/v1/imports/${JOB.id}/preview`) {
        return jsonResponse(200, semColuna);
      }
      return undefined;
    };
    renderPage();

    await userEvent.upload(screen.getByLabelText('Escolher arquivo'), xlsx());
    await userEvent.click(
      await screen.findByRole('button', { name: /conferir antes de importar/i }),
    );

    expect(await screen.findByText(/Campos obrigatórios sem coluna/)).toBeInTheDocument();
    expect(screen.getByText('obrigatório sem coluna')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /importar 78 linhas/i })).toBeDisabled();
  });

  it('mostra o erro da API quando o arquivo não pode ser lido', async () => {
    handler = (url, init) =>
      url.pathname === '/api/v1/imports' && init?.method === 'POST'
        ? jsonResponse(422, {
            error: { code: 'IMPORT_FILE_UNREADABLE', message: 'O arquivo não tem tabelas.' },
          })
        : undefined;
    renderPage();

    await userEvent.upload(screen.getByLabelText('Escolher arquivo'), xlsx());
    expect(await screen.findByText('O arquivo não tem tabelas.')).toBeInTheDocument();
    // Continua no passo 1, com a área de envio disponível.
    expect(screen.getByRole('group', { name: 'Enviar arquivo de dados' })).toBeInTheDocument();
  });

  it('lista as importações anteriores com data, arquivo e situação', async () => {
    fetchMock.mockImplementation(async (input) => {
      const url = new URL(String(input));
      if (url.pathname === '/api/v1/imports') {
        return jsonResponse(200, {
          items: [
            {
              ...JOB,
              status: 'confirmed',
              summary: {
                counts: { total: 80, valid: 78, invalid: 2, duplicates: 0, missingFields: [] },
                errorCount: 2,
                sheets: [],
                result: CONFIRM.result,
              },
            },
          ],
          page: 1,
          pageSize: 20,
          total: 1,
        });
      }
      return jsonResponse(404, { error: { code: 'NOT_FOUND', message: 'x' } });
    });
    renderPage();

    const tabela = await screen.findByRole('table', { name: 'Importações anteriores' });
    const linha = within(tabela).getAllByRole('row')[1]!;
    expect(within(linha).getByText('base.xlsx')).toBeInTheDocument();
    expect(within(linha).getByText('Importado')).toBeInTheDocument();
    expect(within(linha).getByText(/12.077 valores/)).toBeInTheDocument();
  });
});

describe('ImportDataButton', () => {
  it('leva para /import — é o atalho do dashboard', () => {
    render(
      <MemoryRouter>
        <ImportDataButton />
      </MemoryRouter>,
    );
    expect(screen.getByRole('link', { name: /importar dados/i })).toHaveAttribute(
      'href',
      '/import',
    );
  });
});
