/**
 * A leitura de documentos por IA, sem rede: o provider da OpenAI e o extrator do Unstructured.
 *
 * O que estes testes protegem é a regra que torna a IA segura aqui (§35 + A5): o que o modelo
 * devolve é DADO SUSPEITO até passar pelo schema, e falha de serviço externo não pode derrubar
 * o upload de um documento.
 */
import { describe, expect, it, vi } from 'vitest';

import { createOpenAiMetricExtractionProvider } from '../../../infrastructure/extraction/openai-provider.js';
import { createTextExtractor } from '../../../infrastructure/extraction/text-extractor.js';
import {
  createUnstructuredTextExtractor,
  elementsToText,
  UNSTRUCTURED_PARTITION_PATH,
} from '../../../infrastructure/extraction/unstructured-extractor.js';

import type { ChatResult, OpenAiClient } from '../../../infrastructure/ai/openai-client.js';
import type {
  ExtractedText,
  ExtractionDocument,
} from '../../../infrastructure/extraction/types.js';

const DOCUMENT: ExtractionDocument = {
  id: 'doc-1',
  organizationId: 'org-1',
  fileName: 'politica-sla.pdf',
  mimeType: 'application/pdf',
  kind: 'pdf',
};

const TEXT: ExtractedText = {
  kind: 'pdf',
  text: 'A GlobalSys resolve chamados críticos em até 8 horas.',
  meta: { truncated: false },
};

/** Cliente dublê que devolve o JSON que o modelo "escreveria". */
function clientReturning(content: string): {
  client: OpenAiClient;
  chat: ReturnType<typeof vi.fn>;
} {
  const chat = vi.fn(async (): Promise<ChatResult> => ({
    content,
    model: 'gpt-4o-mini',
    usage: undefined,
  }));
  return { client: { model: 'gpt-4o-mini', chat: chat as unknown as OpenAiClient['chat'] }, chat };
}

const validMetric = {
  suggestedName: 'Tempo de resolução de críticos',
  description: 'Horas até resolver um chamado crítico.',
  suggestedType: 'TIME',
  suggestedDirection: 'HIGHER_IS_WORSE',
  unit: 'h',
  suggestedWeight: null,
  thresholdStrategy: 'RATIO_TO_TARGET',
  thresholdTarget: 8,
  thresholdMin: null,
  thresholdMax: null,
  confidence: 0.92,
  sourceExcerpt: 'resolve chamados críticos em até 8 horas',
};

describe('provider da OpenAI para métricas', () => {
  it('converte a saída válida em sugestão, com a meta e o trecho de origem', async () => {
    const { client } = clientReturning(JSON.stringify({ metrics: [validMetric] }));
    const drafts = await createOpenAiMetricExtractionProvider({ client }).extract(DOCUMENT, TEXT);

    expect(drafts).toHaveLength(1);
    expect(drafts[0]).toMatchObject({
      suggestedName: 'Tempo de resolução de críticos',
      suggestedType: 'TIME',
      suggestedDirection: 'HIGHER_IS_WORSE',
      unit: 'h',
      confidence: 0.92,
      sourceExcerpt: 'resolve chamados críticos em até 8 horas',
    });
    expect(drafts[0]?.suggestedThresholds).toEqual({
      strategy: 'RATIO_TO_TARGET',
      target: 8,
    });
    // Peso nulo continua nulo: quem decide peso é quem revisa (§35).
    expect(drafts[0]?.suggestedWeight).toBeUndefined();
  });

  it('descarta a resposta inteira quando o modelo foge do schema', async () => {
    const { client } = clientReturning(
      JSON.stringify({ metrics: [{ ...validMetric, suggestedType: 'INVENTADO' }] }),
    );
    const drafts = await createOpenAiMetricExtractionProvider({ client }).extract(DOCUMENT, TEXT);
    expect(drafts).toEqual([]);
  });

  it('descarta JSON quebrado sem derrubar a extração', async () => {
    const { client } = clientReturning('{ isto não é json');
    const drafts = await createOpenAiMetricExtractionProvider({ client }).extract(DOCUMENT, TEXT);
    expect(drafts).toEqual([]);
  });

  it('filtra sugestão com confiança abaixo do mínimo', async () => {
    const { client } = clientReturning(
      JSON.stringify({ metrics: [validMetric, { ...validMetric, confidence: 0.2 }] }),
    );
    const drafts = await createOpenAiMetricExtractionProvider({
      client,
      minConfidence: 0.8,
    }).extract(DOCUMENT, TEXT);
    expect(drafts).toHaveLength(1);
  });

  it('não chama o modelo quando o documento não tem texto', async () => {
    const { client, chat } = clientReturning('{}');
    const drafts = await createOpenAiMetricExtractionProvider({ client }).extract(DOCUMENT, {
      ...TEXT,
      text: '   ',
    });
    expect(drafts).toEqual([]);
    expect(chat).not.toHaveBeenCalled();
  });

  it('avisa o modelo quando o texto foi cortado', async () => {
    const { client, chat } = clientReturning(JSON.stringify({ metrics: [] }));
    await createOpenAiMetricExtractionProvider({ client, maxInputChars: 10 }).extract(DOCUMENT, {
      ...TEXT,
      text: 'a'.repeat(100),
    });
    const prompt = chat.mock.calls[0]?.[0] as { messages: { content: string }[] };
    expect(prompt.messages[1]?.content).toContain('está cortado');
  });
});

describe('extrator do Unstructured', () => {
  const pdf = { buffer: Buffer.from('%PDF-1.7 conteúdo'), kind: 'pdf' as const };

  function fetchReturning(status: number, body: unknown) {
    return vi.fn(
      async () =>
        new Response(JSON.stringify(body), {
          status,
          headers: { 'content-type': 'application/json' },
        }),
    ) as unknown as typeof fetch;
  }

  it('monta os elementos em texto, marcando as páginas', () => {
    const { text, pages } = elementsToText([
      { type: 'Title', text: 'Política de SLA', metadata: { page_number: 1 } },
      { type: 'NarrativeText', text: 'Resolver em 8 horas.', metadata: { page_number: 1 } },
      { type: 'NarrativeText', text: 'Multa de 10%.', metadata: { page_number: 2 } },
    ]);
    expect(text).toContain('--- Página 1 ---');
    expect(text).toContain('# Política de SLA');
    expect(text).toContain('--- Página 2 ---');
    expect(pages).toBe(2);
  });

  it('prefere a tabela em HTML, que preserva as colunas', () => {
    const { text } = elementsToText([
      {
        type: 'Table',
        text: 'Cliente Valor C001 1500',
        metadata: { text_as_html: '<table><tr><td>C001</td><td>1500</td></tr></table>' },
      },
    ]);
    expect(text).toContain('<table>');
  });

  it('chama a rota documentada e devolve o texto do serviço', async () => {
    const fetchImpl = fetchReturning(200, [
      { type: 'NarrativeText', text: 'Resolver em 8 horas.', metadata: { page_number: 1 } },
    ]);
    const extractor = createUnstructuredTextExtractor({
      apiUrl: 'http://localhost:8000',
      apiKey: 'chave',
      fallback: createTextExtractor(),
      fetchImpl,
    });

    const result = await extractor.extract({ ...pdf, fileName: 'sla.pdf' });

    expect(result.text).toContain('Resolver em 8 horas.');
    const [url, init] = (fetchImpl as unknown as ReturnType<typeof vi.fn>).mock.calls[0] as [
      string,
      RequestInit,
    ];
    expect(url).toBe(`http://localhost:8000${UNSTRUCTURED_PARTITION_PATH}`);
    expect(init.method).toBe('POST');
    expect(new Headers(init.headers).get('unstructured-api-key')).toBe('chave');
    expect(init.body).toBeInstanceOf(FormData);
    expect((init.body as FormData).get('strategy')).toBe('auto');
  });

  it('cai no extrator local quando o serviço responde erro', async () => {
    const onFallback = vi.fn();
    const fallback = { extract: vi.fn(async () => ({ ...TEXT, text: 'lido localmente' })) };
    const extractor = createUnstructuredTextExtractor({
      apiUrl: 'http://localhost:8000',
      fallback,
      fetchImpl: fetchReturning(503, { detail: 'sem memória' }),
      onFallback,
    });

    const result = await extractor.extract(pdf);

    expect(result.text).toBe('lido localmente');
    expect(fallback.extract).toHaveBeenCalledOnce();
    expect(onFallback).toHaveBeenCalledWith(expect.stringContaining('503'));
  });

  it('cai no extrator local quando o serviço está fora do ar', async () => {
    const fallback = { extract: vi.fn(async () => ({ ...TEXT, text: 'lido localmente' })) };
    const extractor = createUnstructuredTextExtractor({
      apiUrl: 'http://localhost:8000',
      fallback,
      fetchImpl: vi.fn(async () => {
        throw new Error('conexão recusada');
      }) as unknown as typeof fetch,
    });

    expect((await extractor.extract(pdf)).text).toBe('lido localmente');
  });

  it('não gasta uma ida à rede para ler CSV, JSON e texto', async () => {
    const fetchImpl = fetchReturning(200, []);
    const extractor = createUnstructuredTextExtractor({
      apiUrl: 'http://localhost:8000',
      fallback: createTextExtractor(),
      fetchImpl,
    });

    const result = await extractor.extract({
      buffer: Buffer.from('cliente_id;valor\nC001;1500'),
      kind: 'csv',
    });

    expect(result.text).toContain('cliente_id');
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});
