/**
 * A tela /import de ponta a ponta, com a API dublada: arquivo → mapeamento → prévia → confirmação.
 *
 * O que estes testes protegem é o que a pessoa vê: a sugestão de coluna já preenchida, os erros
 * do arquivo em português antes de gravar, a impossibilidade de confirmar sem decidir o que fazer
 * com as linhas recusadas, e o resultado do que entrou.
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { jsonResponse } from '@/features/auth/__tests__/fake-supabase';

import { ImportPage } from '../ImportPage';

import type {
  ConfirmImportResult,
  DatasetCatalogItem,
  ImportJob,
  ImportSheet,
  PreviewImportResult,
} from '../api';

const JOB: ImportJob = {
  id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  organizationId: 'org-1',
  fileName: 'clientes.csv',
  fileType: 'CSV',
  sizeBytes: 320,
  status: 'uploaded',
  sheetName: null,
  dataset: null,
  mapping: null,
  summary: null,
  rowsImported: 0,
  errorMessage: null,
  createdBy: 'user-1',
  confirmedAt: null,
  createdAt: '2026-09-20T12:00:00.000Z',
  updatedAt: '2026-09-20T12:00:00.000Z',
};

const CLIENTS_FIELDS = [
  { field: 'external_code', label: 'Código do cliente', required: true },
  { field: 'name', label: 'Nome', required: false },
  { field: 'segment', label: 'Segmento', required: true },
] as const;

const SHEET: ImportSheet = {
  name: 'csv',
  headers: ['cliente_id', 'nome', 'segmento'],
  rowCount: 3,
  sampleRows: [{ cliente_id: 'C001', nome: 'Alfa Ltda', segmento: 'Varejo' }],
  suggestions: [
    {
      dataset: 'clients',
      label: 'Clientes',
      confidence: 0.95,
      mapping: { external_code: 'cliente_id', name: 'nome', segment: 'segmento' },
      fields: [
        {
          ...CLIENTS_FIELDS[0],
          header: 'cliente_id',
          confidence: 0.95,
          reason: 'synonym' as const,
        },
        { ...CLIENTS_FIELDS[1], header: 'nome', confidence: 0.95, reason: 'synonym' as const },
        {
          ...CLIENTS_FIELDS[2],
          header: 'segmento',
          confidence: 0.95,
          reason: 'synonym' as const,
        },
      ],
      unmappedHeaders: [],
      missingRequired: [],
    },
    {
      dataset: 'client_status',
      label: 'Situação dos clientes',
      confidence: 0.4,
      mapping: { external_code: 'cliente_id', status: null, cancellation_period: null },
      fields: [
        {
          ...CLIENTS_FIELDS[0],
          header: 'cliente_id',
          confidence: 0.95,
          reason: 'synonym' as const,
        },
        {
          field: 'status',
          label: 'Situação',
          required: true,
          header: null,
          confidence: 0,
          reason: 'none' as const,
        },
      ],
      unmappedHeaders: ['nome', 'segmento'],
      missingRequired: ['status'],
    },
  ],
};

const CATALOG: DatasetCatalogItem[] = [
  {
    key: 'clients',
    label: 'Clientes',
    description: 'Cadastro da carteira.',
    naturalKey: ['external_code'],
    fields: [
      { key: 'external_code', label: 'Código do cliente', type: 'text', required: true },
      { key: 'name', label: 'Nome', type: 'text', required: false },
      { key: 'segment', label: 'Segmento', type: 'text', required: true },
    ],
  },
];

const PREVIEW_CLEAN: PreviewImportResult = {
  job: { ...JOB, status: 'previewed', sheetName: 'csv', dataset: 'clients' },
  summary: {
    total: 3,
    valid: 3,
    invalid: 0,
    duplicates: 0,
    missingFields: [],
    errorCount: 0,
  },
  errors: [],
  sampleRows: [{ external_code: 'C001', name: 'Alfa Ltda', segment: 'Varejo' }],
};

const PREVIEW_WITH_ERRORS: PreviewImportResult = {
  ...PREVIEW_CLEAN,
  summary: { total: 3, valid: 1, invalid: 1, duplicates: 1, missingFields: [], errorCount: 2 },
  errors: [
    {
      row: 2,
      field: 'segment',
      code: 'MISSING_REQUIRED',
      message: 'Segmento é obrigatório.',
      rawData: { cliente_id: 'C002' },
    },
    {
      row: 3,
      field: null,
      code: 'DUPLICATE',
      message: 'Linha repetida para C001; a primeira ocorrência foi mantida.',
      rawData: { cliente_id: 'C001' },
    },
  ],
};

const CONFIRMED: ConfirmImportResult = {
  job: { ...JOB, status: 'done', rowsImported: 3, confirmedAt: '2026-09-20T12:05:00.000Z' },
  summary: PREVIEW_CLEAN.summary,
  imported: { rows: 3, recordsCreated: 3, recordsUpdated: 0, skipped: [] },
  recalculated: { ok: true, clients: 3 },
};

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={['/import']}>
        <Routes>
          <Route path="/import" element={<ImportPage />} />
          <Route path="/dashboard" element={<p>Dashboard</p>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

function csvFile(name = 'clientes.csv') {
  return new File(['cliente_id;nome;segmento\nC001;Alfa;Varejo'], name, { type: 'text/csv' });
}

type Handler = (url: URL, init: RequestInit | undefined) => Response | undefined;

describe('tela /import', () => {
  const fetchMock = vi.fn<typeof fetch>();
  let handler: Handler = () => undefined;

  /** Respostas do caminho feliz; cada teste sobrescreve o que precisa. */
  const defaultHandler =
    (preview: PreviewImportResult = PREVIEW_CLEAN): Handler =>
    (url, init) => {
      const method = init?.method ?? 'GET';
      if (url.pathname === '/api/v1/imports' && method === 'POST') {
        return jsonResponse(201, { job: JOB, sheets: [SHEET] });
      }
      if (url.pathname === '/api/v1/imports' && method === 'GET') {
        return jsonResponse(200, { items: [], page: 1, pageSize: 10, total: 0 });
      }
      if (url.pathname === '/api/v1/imports/datasets') {
        return jsonResponse(200, { items: CATALOG, total: CATALOG.length });
      }
      if (url.pathname === `/api/v1/imports/${JOB.id}/preview`) {
        return jsonResponse(200, preview);
      }
      if (url.pathname === `/api/v1/imports/${JOB.id}/confirm`) {
        return jsonResponse(200, CONFIRMED);
      }
      return undefined;
    };

  const bodyOf = (pathname: string): Record<string, unknown> | null => {
    const call = fetchMock.mock.calls.find(
      ([input]) => new URL(String(input)).pathname === pathname,
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

  it('começa no passo do arquivo, com os formatos aceitos e o histórico', async () => {
    renderPage();

    expect(screen.getByRole('heading', { name: 'Importar dados' })).toBeInTheDocument();
    expect(screen.getByText(/XLSX, CSV, JSON/)).toBeInTheDocument();
    expect(screen.getByText(/nada é gravado antes de você conferir/i)).toBeInTheDocument();
    expect(await screen.findByText(/Nenhuma importação ainda/)).toBeInTheDocument();

    const steps = within(screen.getByRole('list', { name: 'Passos da importação' }));
    expect(steps.getByText('Arquivo').closest('li')).toHaveAttribute('aria-current', 'step');
  });

  // Arrastar e soltar ignora o `accept` do input: é por aí que um formato errado chega à tela.
  it('recusa no navegador um formato fora da allowlist, sem chamar a API', async () => {
    renderPage();

    fireEvent.drop(screen.getByRole('group', { name: 'Enviar planilha' }), {
      dataTransfer: { files: [new File(['oi'], 'notas.txt', { type: 'text/plain' })] },
    });

    expect(await screen.findByRole('alert')).toHaveTextContent(/Extensão não aceita/);
    const posts = fetchMock.mock.calls.filter(([, init]) => init?.method === 'POST');
    expect(posts).toHaveLength(0);
  });

  it('recusa no navegador um arquivo acima do limite de tamanho', async () => {
    renderPage();
    const big = new File(['x'], 'grande.csv', { type: 'text/csv' });
    Object.defineProperty(big, 'size', { value: 11 * 1024 * 1024 });

    fireEvent.drop(screen.getByRole('group', { name: 'Enviar planilha' }), {
      dataTransfer: { files: [big] },
    });

    expect(await screen.findByRole('alert')).toHaveTextContent(/o limite é 10 MB/);
    expect(fetchMock.mock.calls.filter(([, init]) => init?.method === 'POST')).toHaveLength(0);
  });

  it('depois do envio mostra o mapeamento já sugerido, com a confiança de cada coluna', async () => {
    const user = userEvent.setup();
    renderPage();

    await user.upload(screen.getByLabelText('Escolher planilha'), csvFile());

    expect(
      await screen.findByRole('combobox', { name: 'Coluna para Código do cliente' }),
    ).toHaveValue('cliente_id');
    expect(screen.getByRole('combobox', { name: 'Coluna para Segmento' })).toHaveValue('segmento');
    expect(screen.getAllByText(/Sugerido \(95 %\)/)).toHaveLength(3);

    // O tipo de dado escolhido é o mais provável, e o outro candidato continua disponível.
    expect(screen.getByLabelText('Tipo de dado')).toHaveValue('clients');
    expect(screen.getByRole('option', { name: /Situação dos clientes/ })).toBeInTheDocument();

    const steps = within(screen.getByRole('list', { name: 'Passos da importação' }));
    expect(steps.getByText('Mapeamento').closest('li')).toHaveAttribute('aria-current', 'step');
  });

  it('trocar o tipo de dado troca o mapeamento sugerido junto', async () => {
    const user = userEvent.setup();
    renderPage();
    await user.upload(screen.getByLabelText('Escolher planilha'), csvFile());
    await screen.findByLabelText('Tipo de dado');

    await user.selectOptions(screen.getByLabelText('Tipo de dado'), 'client_status');

    expect(screen.getByRole('combobox', { name: 'Coluna para Situação' })).toHaveValue('');
    expect(screen.getByText(/Falta a coluna de: Situação/)).toBeInTheDocument();
    expect(screen.getByText(/não serão usadas: nome, segmento/)).toBeInTheDocument();
  });

  it('a coluna escolhida à mão vai para a prévia no lugar da sugerida', async () => {
    const user = userEvent.setup();
    renderPage();
    await user.upload(screen.getByLabelText('Escolher planilha'), csvFile());
    await screen.findByLabelText('Tipo de dado');

    await user.selectOptions(
      screen.getByRole('combobox', { name: 'Coluna para Nome' }),
      'segmento',
    );
    expect(screen.getAllByText('Escolhido por você')).toHaveLength(1);
    await user.click(screen.getByRole('button', { name: 'Conferir a prévia' }));

    await screen.findByText('Como os dados vão ficar');
    expect(bodyOf(`/api/v1/imports/${JOB.id}/preview`)).toEqual({
      sheet: 'csv',
      dataset: 'clients',
      mapping: { external_code: 'cliente_id', name: 'segmento', segment: 'segmento' },
    });
  });

  it('a prévia mostra o que entra e não grava nada', async () => {
    const user = userEvent.setup();
    renderPage();
    await user.upload(screen.getByLabelText('Escolher planilha'), csvFile());
    await screen.findByLabelText('Tipo de dado');
    await user.click(screen.getByRole('button', { name: 'Conferir a prévia' }));

    expect(await screen.findByText(/Todas as 3 linhas passaram na validação/)).toBeInTheDocument();
    expect(screen.getByText('Prontas para importar')).toBeInTheDocument();
    // A amostra usa o rótulo do campo, não a chave técnica.
    expect(screen.getByRole('columnheader', { name: 'Código do cliente' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Importar 3 linhas' })).toBeEnabled();

    const confirms = fetchMock.mock.calls.filter(([input]) => String(input).endsWith('/confirm'));
    expect(confirms).toHaveLength(0);
  });

  it('a prévia lista os erros linha a linha, em português', async () => {
    handler = defaultHandler(PREVIEW_WITH_ERRORS);
    const user = userEvent.setup();
    renderPage();
    await user.upload(screen.getByLabelText('Escolher planilha'), csvFile());
    await screen.findByLabelText('Tipo de dado');
    await user.click(screen.getByRole('button', { name: 'Conferir a prévia' }));

    expect(await screen.findByText('2 linhas recusadas')).toBeInTheDocument();
    expect(screen.getByText('Segmento é obrigatório.')).toBeInTheDocument();
    expect(screen.getByText('Campo obrigatório vazio')).toBeInTheDocument();
    expect(screen.getByText('Linha repetida')).toBeInTheDocument();
    expect(screen.getByText('Linha inteira')).toBeInTheDocument();
  });

  it('com linhas recusadas, confirmar exige decidir o que fazer com elas', async () => {
    handler = defaultHandler(PREVIEW_WITH_ERRORS);
    const user = userEvent.setup();
    renderPage();
    await user.upload(screen.getByLabelText('Escolher planilha'), csvFile());
    await screen.findByLabelText('Tipo de dado');
    await user.click(screen.getByRole('button', { name: 'Conferir a prévia' }));

    const confirmButton = await screen.findByRole('button', { name: 'Importar 1 linha' });
    expect(confirmButton).toBeDisabled();

    await user.click(
      screen.getByLabelText(
        /Importar assim mesmo a 1 linha boa|Importar assim mesmo as 1 linhas boas/,
      ),
    );
    expect(confirmButton).toBeEnabled();

    await user.click(confirmButton);
    await screen.findByText(/linhas importadas/);
    expect(bodyOf(`/api/v1/imports/${JOB.id}/confirm`)).toEqual({ ignoreInvalidRows: true });
  });

  it('sem nenhuma linha válida não há o que confirmar', async () => {
    handler = defaultHandler({
      ...PREVIEW_CLEAN,
      summary: { total: 2, valid: 0, invalid: 2, duplicates: 0, missingFields: [], errorCount: 2 },
      errors: PREVIEW_WITH_ERRORS.errors,
      sampleRows: [],
    });
    const user = userEvent.setup();
    renderPage();
    await user.upload(screen.getByLabelText('Escolher planilha'), csvFile());
    await screen.findByLabelText('Tipo de dado');
    await user.click(screen.getByRole('button', { name: 'Conferir a prévia' }));

    expect(await screen.findByRole('button', { name: 'Importar 0 linhas' })).toBeDisabled();
    expect(screen.getByText(/Nenhuma linha passou na validação/)).toBeInTheDocument();
  });

  it('avisa quando falta a coluna de um campo obrigatório', async () => {
    handler = defaultHandler({
      ...PREVIEW_CLEAN,
      summary: {
        total: 3,
        valid: 0,
        invalid: 3,
        duplicates: 0,
        missingFields: ['segment'],
        errorCount: 3,
      },
      sampleRows: [],
    });
    const user = userEvent.setup();
    renderPage();
    await user.upload(screen.getByLabelText('Escolher planilha'), csvFile());
    await screen.findByLabelText('Tipo de dado');
    await user.click(screen.getByRole('button', { name: 'Conferir a prévia' }));

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(/Sem coluna para Segmento/);
    expect(alert).toHaveTextContent(/nenhuma linha entra/);
  });

  it('confirma e mostra o que entrou e que a carteira foi recalculada', async () => {
    const user = userEvent.setup();
    renderPage();
    await user.upload(screen.getByLabelText('Escolher planilha'), csvFile());
    await screen.findByLabelText('Tipo de dado');
    await user.click(screen.getByRole('button', { name: 'Conferir a prévia' }));
    await user.click(await screen.findByRole('button', { name: 'Importar 3 linhas' }));

    expect(await screen.findByText(/3 linhas importadas de clientes\.csv/)).toBeInTheDocument();
    expect(screen.getByText(/3 registros criados e 0 atualizados/)).toBeInTheDocument();
    expect(screen.getByText(/Carteira recalculada: 3 clientes avaliados/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Ver o dashboard' })).toHaveAttribute(
      'href',
      '/dashboard',
    );
  });

  it('avisa quando os dados entraram mas o recálculo não rodou', async () => {
    handler = (url, init) => {
      if (url.pathname === `/api/v1/imports/${JOB.id}/confirm`) {
        return jsonResponse(200, {
          ...CONFIRMED,
          recalculated: { ok: false, reason: 'Nenhuma versão de modelo ativa nesta organização.' },
        });
      }
      return defaultHandler()(url, init);
    };
    const user = userEvent.setup();
    renderPage();
    await user.upload(screen.getByLabelText('Escolher planilha'), csvFile());
    await screen.findByLabelText('Tipo de dado');
    await user.click(screen.getByRole('button', { name: 'Conferir a prévia' }));
    await user.click(await screen.findByRole('button', { name: 'Importar 3 linhas' }));

    expect(
      await screen.findByText(/não foi recalculada: Nenhuma versão de modelo ativa/),
    ).toBeInTheDocument();
  });

  it('lista as linhas que não puderam ser gravadas, com o motivo', async () => {
    handler = (url, init) => {
      if (url.pathname === `/api/v1/imports/${JOB.id}/confirm`) {
        return jsonResponse(200, {
          ...CONFIRMED,
          imported: {
            rows: 0,
            recordsCreated: 0,
            recordsUpdated: 0,
            skipped: [
              {
                row: 1,
                externalCode: 'C999',
                reason: 'Cliente não está na carteira. Importe a tabela de clientes antes.',
              },
            ],
          },
        });
      }
      return defaultHandler()(url, init);
    };
    const user = userEvent.setup();
    renderPage();
    await user.upload(screen.getByLabelText('Escolher planilha'), csvFile());
    await screen.findByLabelText('Tipo de dado');
    await user.click(screen.getByRole('button', { name: 'Conferir a prévia' }));
    await user.click(await screen.findByRole('button', { name: 'Importar 3 linhas' }));

    expect(await screen.findByText(/1 linha válida não pôde ser gravada/)).toBeInTheDocument();
    expect(screen.getByText('C999')).toBeInTheDocument();
    expect(screen.getByText(/não está na carteira/)).toBeInTheDocument();
  });

  it('mostra o erro da API quando a confirmação é recusada e não avança de passo', async () => {
    handler = (url, init) => {
      if (url.pathname === `/api/v1/imports/${JOB.id}/confirm`) {
        return jsonResponse(409, {
          error: {
            code: 'IMPORT_HAS_INVALID_ROWS',
            message: '2 de 3 linhas foram recusadas.',
          },
        });
      }
      return defaultHandler()(url, init);
    };
    const user = userEvent.setup();
    renderPage();
    await user.upload(screen.getByLabelText('Escolher planilha'), csvFile());
    await screen.findByLabelText('Tipo de dado');
    await user.click(screen.getByRole('button', { name: 'Conferir a prévia' }));
    await user.click(await screen.findByRole('button', { name: 'Importar 3 linhas' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('2 de 3 linhas foram recusadas.');
    expect(screen.getByRole('button', { name: 'Importar 3 linhas' })).toBeInTheDocument();
  });

  it('mostra o erro da API quando o arquivo não pode ser lido', async () => {
    handler = (url, init) =>
      url.pathname === '/api/v1/imports' && init?.method === 'POST'
        ? jsonResponse(400, {
            error: { code: 'UNREADABLE_FILE', message: 'O arquivo não tem nenhuma tabela.' },
          })
        : defaultHandler()(url, init);
    const user = userEvent.setup();
    renderPage();

    await user.upload(screen.getByLabelText('Escolher planilha'), csvFile());

    expect(await screen.findByRole('alert')).toHaveTextContent('O arquivo não tem nenhuma tabela.');
    expect(screen.getByLabelText('Escolher planilha')).toBeInTheDocument();
  });

  it('volta da prévia para o mapeamento sem perder o que foi escolhido', async () => {
    const user = userEvent.setup();
    renderPage();
    await user.upload(screen.getByLabelText('Escolher planilha'), csvFile());
    await screen.findByLabelText('Tipo de dado');
    await user.selectOptions(
      screen.getByRole('combobox', { name: 'Coluna para Nome' }),
      'segmento',
    );
    await user.click(screen.getByRole('button', { name: 'Conferir a prévia' }));
    await screen.findByText('Como os dados vão ficar');

    await user.click(screen.getByRole('button', { name: 'Voltar ao mapeamento' }));

    await waitFor(() => {
      expect(screen.getByRole('combobox', { name: 'Coluna para Nome' })).toHaveValue('segmento');
    });
  });
});
