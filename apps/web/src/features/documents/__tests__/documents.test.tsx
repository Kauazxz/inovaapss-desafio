import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { jsonResponse } from '@/features/auth/__tests__/fake-supabase';

import { DocumentDetailPage } from '../DocumentDetailPage';
import { DocumentsPage } from '../DocumentsPage';

import type { MetricPrefill, MetricSuggestion, UploadedDocument } from '../api';

const DOC_A: UploadedDocument = {
  id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  organizationId: 'org-1',
  fileName: 'politica-sla.pdf',
  mimeType: 'application/pdf',
  kind: 'pdf',
  sizeBytes: 2048,
  status: 'uploaded',
  uploadedBy: 'user-1',
  hasExtractedText: false,
  extractedTextPreview: null,
  extractionError: null,
  extractedAt: null,
  createdAt: '2026-09-19T12:00:00.000Z',
  updatedAt: '2026-09-19T12:00:00.000Z',
};

const DOC_B: UploadedDocument = {
  ...DOC_A,
  id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  fileName: 'manual-kpi.docx',
  mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  kind: 'docx',
  sizeBytes: 1_500_000,
  status: 'extracted',
  hasExtractedText: true,
  extractedTextPreview:
    'Manual de KPI da GlobalSys.\nO tempo medio de resolucao nao pode passar de 8 horas.',
  extractedAt: '2026-09-19T12:05:00.000Z',
};

const SUGGESTION: MetricSuggestion = {
  id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
  uploadedDocumentId: DOC_B.id,
  organizationId: 'org-1',
  suggestedName: 'Tempo médio de resolução',
  description: null,
  suggestedType: 'TIME',
  suggestedDirection: 'HIGHER_IS_WORSE',
  unit: 'h',
  suggestedWeight: 0.16,
  suggestedFormula: null,
  suggestedThresholds: null,
  confidence: 1,
  sourceExcerpt: 'nao pode passar de 8 horas',
  provider: 'manual',
  status: 'pending',
  createdBy: 'user-1',
  reviewedBy: null,
  reviewedAt: null,
  createdAt: '2026-09-19T12:10:00.000Z',
  updatedAt: '2026-09-19T12:10:00.000Z',
};

const PREFILL: MetricPrefill = {
  name: SUGGESTION.suggestedName,
  slug: 'tempo-medio-de-resolucao',
  description: null,
  category: 'Descoberta em documento',
  metricType: 'TIME',
  unit: 'h',
  direction: 'HIGHER_IS_WORSE',
  sourceType: 'DOCUMENT',
  periodicity: 'MONTHLY',
  weight: 0.16,
  normalization: null,
  formula: null,
  isActive: false,
  origin: { documentId: DOC_B.id, suggestionId: SUGGESTION.id, fileName: DOC_B.fileName },
};

function MetricsStub() {
  const location = useLocation();
  const prefill = (location.state as { prefill?: MetricPrefill } | null)?.prefill;
  return <p>Métricas: {prefill ? `prefill ${prefill.name} (${prefill.slug})` : 'sem prefill'}</p>;
}

function renderAt(path: string) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/documents" element={<DocumentsPage />} />
          <Route path="/documents/:id" element={<DocumentDetailPage />} />
          <Route path="/metrics" element={<MetricsStub />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

type Handler = (url: URL, init: RequestInit | undefined) => Response | undefined;

describe('feature documents', () => {
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

  describe('/documents', () => {
    it('lista os documentos com tipo, tamanho e status, e liga ao detalhe', async () => {
      handler = (url) =>
        url.pathname === '/api/v1/documents'
          ? jsonResponse(200, { items: [DOC_B, DOC_A], page: 1, pageSize: 20, total: 2 })
          : undefined;
      renderAt('/documents');

      const table = await screen.findByRole('table', { name: 'Documentos enviados' });
      const rows = within(table).getAllByRole('row').slice(1);
      expect(rows).toHaveLength(2);
      expect(within(rows[0]!).getByRole('link', { name: 'manual-kpi.docx' })).toHaveAttribute(
        'href',
        `/documents/${DOC_B.id}`,
      );
      expect(within(rows[0]!).getByText('DOCX')).toBeInTheDocument();
      expect(within(rows[0]!).getByText('1,4 MB')).toBeInTheDocument();
      expect(within(rows[0]!).getByText('Texto extraído')).toBeInTheDocument();
      expect(within(rows[1]!).getByText('Enviado')).toBeInTheDocument();
      expect(screen.getByText('Documentos enviados (2)')).toBeInTheDocument();
    });

    it('mostra o estado vazio com os tipos aceitos', async () => {
      handler = (url) =>
        url.pathname === '/api/v1/documents'
          ? jsonResponse(200, { items: [], page: 1, pageSize: 20, total: 0 })
          : undefined;
      renderAt('/documents');
      expect(await screen.findByText('Nenhum documento enviado')).toBeInTheDocument();
      expect(screen.getByText(/PDF, DOCX, XLSX, CSV, JSON, MD ou TXT/)).toBeInTheDocument();
      expect(screen.getByText(/Aceitos: PDF, DOCX, XLSX, CSV, JSON, MD, TXT/)).toBeInTheDocument();
    });

    it('mostra o erro da API com botão de tentar de novo', async () => {
      handler = (url) =>
        url.pathname === '/api/v1/documents'
          ? jsonResponse(500, { error: { code: 'INTERNAL_ERROR', message: 'Banco fora do ar.' } })
          : undefined;
      renderAt('/documents');
      expect(
        await screen.findByText('Não foi possível carregar os documentos'),
      ).toBeInTheDocument();
      expect(screen.getByText('Banco fora do ar.')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /tentar de novo/i })).toBeInTheDocument();
    });

    it('recusa no navegador um arquivo fora da allowlist, sem chamar a API', async () => {
      handler = (url) =>
        url.pathname === '/api/v1/documents'
          ? jsonResponse(200, { items: [], page: 1, pageSize: 20, total: 0 })
          : undefined;
      renderAt('/documents');
      await screen.findByText('Nenhum documento enviado');

      const input = screen.getByLabelText('Escolher arquivos');
      const exe = new File(['MZ'], 'virus.exe', { type: 'application/octet-stream' });
      await userEvent.upload(input, exe, { applyAccept: false });

      const alert = await screen.findByRole('alert');
      expect(alert).toHaveTextContent('virus.exe');
      expect(alert).toHaveTextContent(/Extensão não aceita/);
      expect(calls().filter((c) => c.startsWith('POST'))).toEqual([]);
    });

    it('envia um CSV como multipart, avisa e recarrega a lista', async () => {
      let uploaded = false;
      handler = (url, init) => {
        if (url.pathname === '/api/v1/documents' && init?.method === 'POST') {
          expect(init.body).toBeInstanceOf(FormData);
          const file = (init.body as FormData).get('file');
          expect(file).toBeInstanceOf(File);
          expect((file as File).name).toBe('relatorio.csv');
          uploaded = true;
          return jsonResponse(201, {
            document: {
              ...DOC_A,
              id: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
              fileName: 'relatorio.csv',
              kind: 'csv',
            },
          });
        }
        if (url.pathname === '/api/v1/documents') {
          return jsonResponse(200, {
            items: uploaded ? [{ ...DOC_A, fileName: 'relatorio.csv', kind: 'csv' }] : [],
            page: 1,
            pageSize: 20,
            total: uploaded ? 1 : 0,
          });
        }
        return undefined;
      };
      renderAt('/documents');
      await screen.findByText('Nenhum documento enviado');

      const csv = new File(['a,b\n1,2\n'], 'relatorio.csv', { type: 'text/csv' });
      await userEvent.upload(screen.getByLabelText('Escolher arquivos'), csv);

      const notices = await screen.findByRole('list', { name: 'Resultado do envio' });
      expect(notices).toHaveTextContent('relatorio.csv: enviado.');
      expect(await screen.findByRole('link', { name: 'relatorio.csv' })).toBeInTheDocument();
    });

    it('mostra o erro da API no envio (415)', async () => {
      handler = (url, init) => {
        if (url.pathname === '/api/v1/documents' && init?.method === 'POST') {
          return jsonResponse(415, {
            error: { code: 'UNSUPPORTED_FILE_TYPE', message: 'O conteúdo não é um PDF válido.' },
          });
        }
        if (url.pathname === '/api/v1/documents') {
          return jsonResponse(200, { items: [], page: 1, pageSize: 20, total: 0 });
        }
        return undefined;
      };
      renderAt('/documents');
      await screen.findByText('Nenhum documento enviado');

      const pdf = new File(['nada'], 'contrato.pdf', { type: 'application/pdf' });
      await userEvent.upload(screen.getByLabelText('Escolher arquivos'), pdf);

      const alert = await screen.findByRole('alert');
      expect(alert).toHaveTextContent('contrato.pdf: O conteúdo não é um PDF válido.');
    });
  });

  describe('/documents/:id', () => {
    const detailHandler =
      (overrides: { suggestions?: MetricSuggestion[]; doc?: UploadedDocument } = {}): Handler =>
      (url, init) => {
        const doc = overrides.doc ?? DOC_B;
        if (url.pathname === `/api/v1/documents/${doc.id}`) {
          return jsonResponse(200, {
            document: {
              ...doc,
              downloadUrl: 'https://storage.example/signed',
              downloadUrlExpiresInSeconds: 300,
            },
          });
        }
        if (url.pathname === `/api/v1/documents/${doc.id}/suggestions` && init?.method !== 'POST') {
          return jsonResponse(200, { items: overrides.suggestions ?? [], total: 0 });
        }
        return undefined;
      };

    it('mostra o preview do texto extraído, o link de download e o estado vazio das sugestões', async () => {
      handler = detailHandler();
      renderAt(`/documents/${DOC_B.id}`);

      expect(await screen.findByRole('heading', { name: 'manual-kpi.docx' })).toBeInTheDocument();
      expect(screen.getByText(/Manual de KPI da GlobalSys/)).toBeInTheDocument();
      expect(screen.getByRole('link', { name: /baixar/i })).toHaveAttribute(
        'href',
        'https://storage.example/signed',
      );
      expect(await screen.findByText('Nenhuma sugestão ainda')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Extrair texto de novo' })).toBeInTheDocument();
    });

    it('documento ainda sem texto: chama a extração e mostra o resultado', async () => {
      let extracted = false;
      const base = detailHandler({ doc: DOC_A });
      handler = (url, init) => {
        if (url.pathname === `/api/v1/documents/${DOC_A.id}/extract-metrics`) {
          extracted = true;
          return jsonResponse(200, {
            document: {
              ...DOC_A,
              status: 'extracted',
              hasExtractedText: true,
              extractedTextPreview: 'Politica de SLA',
            },
            suggestions: [],
            extraction: { provider: 'manual', chars: 15, truncated: false },
          });
        }
        if (url.pathname === `/api/v1/documents/${DOC_A.id}` && extracted) {
          return jsonResponse(200, {
            document: {
              ...DOC_A,
              status: 'extracted',
              hasExtractedText: true,
              extractedTextPreview: 'Politica de SLA',
              downloadUrl: 'https://storage.example/signed',
              downloadUrlExpiresInSeconds: 300,
            },
          });
        }
        return base(url, init);
      };
      renderAt(`/documents/${DOC_A.id}`);

      expect(await screen.findByText(/Ainda não há texto extraído/)).toBeInTheDocument();
      await userEvent.click(screen.getByRole('button', { name: 'Extrair texto' }));
      expect(await screen.findByText('Politica de SLA')).toBeInTheDocument();
      expect(calls()).toContain(`POST /api/v1/documents/${DOC_A.id}/extract-metrics`);
    });

    it('lista as sugestões; aceitar leva a /metrics com state.prefill', async () => {
      const base = detailHandler({ suggestions: [SUGGESTION] });
      handler = (url, init) => {
        if (url.pathname === `/api/v1/metric-suggestions/${SUGGESTION.id}/accept`) {
          return jsonResponse(200, {
            suggestion: { ...SUGGESTION, status: 'accepted' },
            metricPayload: PREFILL,
          });
        }
        return base(url, init);
      };
      renderAt(`/documents/${DOC_B.id}`);

      const table = await screen.findByRole('table', { name: 'Sugestões de métrica' });
      const row = within(table).getAllByRole('row')[1]!;
      expect(within(row).getByText('Tempo médio de resolução')).toBeInTheDocument();
      expect(within(row).getByText('Tempo')).toBeInTheDocument();
      expect(within(row).getByText('Maior é pior')).toBeInTheDocument();
      expect(within(row).getByText('16 %')).toBeInTheDocument();
      expect(within(row).getByText('Pendente')).toBeInTheDocument();

      await userEvent.click(within(row).getByRole('button', { name: /^Aceitar/ }));
      expect(
        await screen.findByText(
          'Métricas: prefill Tempo médio de resolução (tempo-medio-de-resolucao)',
        ),
      ).toBeInTheDocument();
    });

    it('rejeitar chama a API e atualiza o status', async () => {
      let rejected = false;
      const base = detailHandler();
      handler = (url, init) => {
        if (url.pathname === `/api/v1/metric-suggestions/${SUGGESTION.id}/reject`) {
          rejected = true;
          return jsonResponse(200, { suggestion: { ...SUGGESTION, status: 'rejected' } });
        }
        if (url.pathname === `/api/v1/documents/${DOC_B.id}/suggestions`) {
          return jsonResponse(200, {
            items: [rejected ? { ...SUGGESTION, status: 'rejected' } : SUGGESTION],
            total: 1,
          });
        }
        return base(url, init);
      };
      renderAt(`/documents/${DOC_B.id}`);

      await userEvent.click(await screen.findByRole('button', { name: /^Rejeitar/ }));
      expect(await screen.findByText('Rejeitada')).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /^Aceitar/ })).not.toBeInTheDocument();
    });

    it('formulário de nova sugestão valida e envia o corpo para a API', async () => {
      let posted: unknown = null;
      const base = detailHandler();
      handler = (url, init) => {
        if (
          url.pathname === `/api/v1/documents/${DOC_B.id}/suggestions` &&
          init?.method === 'POST'
        ) {
          posted = JSON.parse(String(init.body));
          return jsonResponse(201, {
            suggestion: { ...SUGGESTION, suggestedName: 'Cumprimento de SLA' },
          });
        }
        if (url.pathname === `/api/v1/documents/${DOC_B.id}/suggestions`) {
          return jsonResponse(200, {
            items: posted ? [{ ...SUGGESTION, suggestedName: 'Cumprimento de SLA' }] : [],
            total: posted ? 1 : 0,
          });
        }
        return base(url, init);
      };
      renderAt(`/documents/${DOC_B.id}`);
      await screen.findByText('Nenhuma sugestão ainda');

      await userEvent.click(
        screen.getByRole('button', { name: 'Nova sugestão a partir deste documento' }),
      );
      const form = screen.getByRole('form', { name: 'Nova sugestão a partir deste documento' });

      // Vazio: erro de validação local, sem chamar a API.
      await userEvent.click(within(form).getByRole('button', { name: 'Salvar sugestão' }));
      expect(await within(form).findByText(/pelo menos 2 caracteres/)).toBeInTheDocument();
      expect(posted).toBeNull();

      await userEvent.type(within(form).getByLabelText('Nome da métrica'), 'Cumprimento de SLA');
      await userEvent.selectOptions(within(form).getByLabelText('Tipo'), 'PERCENTAGE');
      await userEvent.selectOptions(within(form).getByLabelText('Direção'), 'HIGHER_IS_BETTER');
      await userEvent.type(within(form).getByLabelText('Unidade'), '%');
      await userEvent.type(within(form).getByLabelText('Peso sugerido (%)'), '12');
      await userEvent.type(within(form).getByLabelText(/Fórmula/), '{{"var": "value"}');
      await userEvent.click(within(form).getByRole('button', { name: 'Salvar sugestão' }));

      await waitFor(() => expect(posted).not.toBeNull());
      expect(posted).toEqual({
        suggestedName: 'Cumprimento de SLA',
        suggestedType: 'PERCENTAGE',
        suggestedDirection: 'HIGHER_IS_BETTER',
        unit: '%',
        suggestedWeight: 0.12,
        suggestedFormula: { var: 'value' },
      });
      const table = await screen.findByRole('table', { name: 'Sugestões de métrica' });
      expect(within(table).getByText('Cumprimento de SLA')).toBeInTheDocument();
    });

    it('404 da API vira "Documento não encontrado"', async () => {
      handler = (url) =>
        url.pathname === `/api/v1/documents/${DOC_A.id}`
          ? jsonResponse(404, {
              error: { code: 'NOT_FOUND', message: 'Documento não encontrado.' },
            })
          : undefined;
      renderAt(`/documents/${DOC_A.id}`);
      expect(await screen.findByText('Documento não encontrado')).toBeInTheDocument();
      expect(screen.getByRole('link', { name: /voltar para documentos/i })).toHaveAttribute(
        'href',
        '/documents',
      );
    });
  });
});
