/**
 * Leitura de documentos pela Web API do Unstructured (§35 + A4).
 *
 * https://github.com/Unstructured-IO/unstructured-api — `POST /general/v0/general`, multipart
 * com o campo `files`, resposta JSON com uma lista de "elementos" (`{ type, text, metadata }`).
 * Uma instância local sobe com:
 *
 *   docker run --rm -p 8000:8000 quay.io/unstructured-io/unstructured-api:latest
 *
 * Por que existe, se já há extratores locais: o Unstructured entende formatos que o projeto não
 * lê hoje (PPTX, imagens, e-mail, HTML) e devolve o documento SEGMENTADO por tipo de elemento
 * (título, parágrafo, tabela, rodapé), o que dá um texto muito melhor para o modelo de IA
 * trabalhar em cima do que um despejo de texto corrido.
 *
 * Divisão de trabalho (é de propósito, não é preguiça):
 *   - PDF, DOCX e XLSX vão para o Unstructured, onde ele ganha da nossa extração local;
 *   - CSV, JSON, Markdown e TXT ficam no extrator local, que já os resume melhor (cabeçalhos,
 *     amostra de linhas, chaves do JSON) e não paga uma ida à rede para ler texto puro.
 *
 * Qualquer falha — serviço fora do ar, timeout, resposta inesperada — cai no extrator local em
 * vez de derrubar o upload. O conteúdo do documento nunca é registrado em log.
 */
import { z } from 'zod';

import type { DocumentKind } from '@inovaapss/validation';

import { MAX_EXTRACTED_TEXT_CHARS, type TextExtractor } from './text-extractor.js';

import type { ExtractedText } from './types.js';

/** Caminho da rota de partição da Web API (v0). */
export const UNSTRUCTURED_PARTITION_PATH = '/general/v0/general';

/** Estratégias aceitas pelo Unstructured; `auto` deixa o serviço decidir por documento. */
export const UNSTRUCTURED_STRATEGIES = ['auto', 'fast', 'hi_res', 'ocr_only'] as const;
export type UnstructuredStrategy = (typeof UNSTRUCTURED_STRATEGIES)[number];

/** Tipos que ganham qualidade indo para o Unstructured. */
const DELEGATED_KINDS: readonly DocumentKind[] = ['pdf', 'docx', 'xlsx'];

/** MIME enviado no multipart por tipo lógico, para o serviço escolher o parser certo. */
const MIME_BY_KIND: Readonly<Record<DocumentKind, string>> = {
  pdf: 'application/pdf',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  csv: 'text/csv',
  json: 'application/json',
  markdown: 'text/markdown',
  text: 'text/plain',
};

const EXTENSION_BY_KIND: Readonly<Record<DocumentKind, string>> = {
  pdf: 'pdf',
  docx: 'docx',
  xlsx: 'xlsx',
  csv: 'csv',
  json: 'json',
  markdown: 'md',
  text: 'txt',
};

/**
 * Um elemento devolvido pelo Unstructured. Só `text` é realmente necessário; o resto é lido
 * quando vem, porque a lista de campos do `metadata` cresce entre versões do serviço e não vale
 * quebrar a leitura por causa de um campo novo.
 */
const elementSchema = z.object({
  type: z.string().optional(),
  text: z.string().optional(),
  metadata: z
    .object({
      page_number: z.number().int().positive().optional(),
      text_as_html: z.string().optional(),
    })
    .loose()
    .optional(),
});

const responseSchema = z.array(elementSchema);

export interface UnstructuredExtractorOptions {
  /** Base da API, ex.: `http://localhost:8000`. */
  apiUrl: string;
  /** Cabeçalho `unstructured-api-key`, quando a instância exigir. */
  apiKey?: string | undefined;
  /** Extrator usado para os tipos de texto e como rede de segurança em qualquer falha. */
  fallback: TextExtractor;
  strategy?: UnstructuredStrategy;
  /** Tempo máximo de espera por documento (padrão 60 s: `hi_res` com OCR é lento). */
  timeoutMs?: number;
  /** Injetável nos testes; padrão `globalThis.fetch`. */
  fetchImpl?: typeof fetch;
  /** Chamado quando a delegação falha e o extrator local assume. Nunca recebe conteúdo. */
  onFallback?: (reason: string) => void;
}

/** Elementos → texto legível, com marcação de página quando o serviço informa. */
export function elementsToText(elements: readonly z.infer<typeof elementSchema>[]): {
  text: string;
  pages: number | undefined;
} {
  const lines: string[] = [];
  let lastPage: number | undefined;
  let maxPage = 0;

  for (const element of elements) {
    const page = element.metadata?.page_number;
    if (page !== undefined) {
      maxPage = Math.max(maxPage, page);
      if (page !== lastPage) {
        if (lines.length > 0) lines.push('');
        lines.push(`--- Página ${page} ---`);
        lastPage = page;
      }
    }
    // Numa tabela, a versão em HTML preserva as colunas; o `text` vem como uma linha só.
    const html = element.metadata?.text_as_html;
    const content = (element.type === 'Table' && html ? html : element.text)?.trim();
    if (content === undefined || content === '') continue;
    lines.push(element.type === 'Title' ? `# ${content}` : content);
  }

  return { text: lines.join('\n'), pages: maxPage > 0 ? maxPage : undefined };
}

/**
 * Extrator que delega a leitura ao Unstructured e cai no local quando não dá.
 * Mantém a mesma interface `TextExtractor`, então o módulo de documentos não muda.
 */
export function createUnstructuredTextExtractor(
  options: UnstructuredExtractorOptions,
): TextExtractor {
  const {
    apiUrl,
    apiKey,
    fallback,
    strategy = 'auto',
    timeoutMs = 60_000,
    fetchImpl = globalThis.fetch,
    onFallback,
  } = options;
  const endpoint = `${apiUrl.replace(/\/+$/, '')}${UNSTRUCTURED_PARTITION_PATH}`;

  const partition = async (
    buffer: Buffer,
    kind: DocumentKind,
    fileName: string | undefined,
  ): Promise<ExtractedText> => {
    const name = fileName ?? `documento.${EXTENSION_BY_KIND[kind]}`;
    const form = new FormData();
    form.append('files', new Blob([new Uint8Array(buffer)], { type: MIME_BY_KIND[kind] }), name);
    form.append('strategy', strategy);
    form.append('output_format', 'application/json');
    // Sem coordenadas: a tela mostra texto, e elas só engordariam a resposta.
    form.append('coordinates', 'false');

    const headers = new Headers({ accept: 'application/json' });
    if (apiKey !== undefined && apiKey !== '') headers.set('unstructured-api-key', apiKey);

    const response = await fetchImpl(endpoint, {
      method: 'POST',
      headers,
      body: form,
      signal: AbortSignal.timeout(timeoutMs),
    });

    if (!response.ok) {
      // A mensagem do serviço pode citar o arquivo; só o status entra no motivo do fallback.
      throw new Error(`o Unstructured respondeu ${response.status}`);
    }

    const parsed = responseSchema.safeParse(await response.json());
    if (!parsed.success) throw new Error('resposta do Unstructured fora do formato esperado');

    const { text, pages } = elementsToText(parsed.data);
    if (text.trim() === '') throw new Error('o Unstructured não encontrou texto no documento');

    const truncated = text.length > MAX_EXTRACTED_TEXT_CHARS;
    return {
      kind,
      text: truncated ? text.slice(0, MAX_EXTRACTED_TEXT_CHARS) : text,
      meta: {
        ...(pages === undefined ? {} : { pages }),
        truncated,
      },
    };
  };

  return {
    async extract(input) {
      if (!DELEGATED_KINDS.includes(input.kind)) return fallback.extract(input);
      try {
        return await partition(input.buffer, input.kind, input.fileName);
      } catch (err) {
        const reason = err instanceof Error ? err.message : 'falha desconhecida';
        onFallback?.(reason);
        return fallback.extract(input);
      }
    },
  };
}
