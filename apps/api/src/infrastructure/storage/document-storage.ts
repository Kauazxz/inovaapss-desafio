/**
 * Contrato de armazenamento de documentos (§35). A implementação padrão é o Supabase Storage
 * (supabase-storage.ts); os testes usam a versão em memória (memory-storage.ts). Trocar de
 * provedor é implementar esta interface e injetar em createApiV1Router.
 *
 * Caminho dos objetos: <organizationId>/<documentId>/<nome-seguro> — o primeiro segmento é o
 * tenant, o que permite policies por prefixo no bucket se um dia o front falar direto com ele.
 */

export interface StoredObject {
  /** Caminho dentro do bucket. */
  path: string;
}

export interface UploadObjectInput {
  path: string;
  body: Buffer;
  contentType: string;
}

export interface DocumentStorage {
  upload(input: UploadObjectInput): Promise<StoredObject>;
  download(path: string): Promise<Buffer>;
  /** URL de download com validade curta (segundos). */
  createSignedUrl(path: string, expiresInSeconds: number): Promise<string>;
  remove(paths: readonly string[]): Promise<void>;
}

/** Nome do objeto extraído (texto completo) dentro da pasta do documento. */
export const EXTRACTED_TEXT_OBJECT_NAME = 'extracted.txt';

/** Validade padrão da URL assinada devolvida em GET /documents/:id. */
export const SIGNED_URL_TTL_SECONDS = 300;

const MAX_SAFE_NAME_LENGTH = 120;

/**
 * Nome seguro para o objeto: sem caminhos, sem caracteres de controle, sem acentos que alguns
 * provedores recusam na chave, com a extensão preservada. Vazio vira "documento".
 */
export function sanitizeFileName(fileName: string): string {
  const base = fileName.split(/[\\/]/).pop() ?? '';
  const normalized = base
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/^[-.]+|[-.]+$/g, '');
  const trimmed = normalized.slice(0, MAX_SAFE_NAME_LENGTH);
  return trimmed === '' ? 'documento' : trimmed;
}

export function buildDocumentObjectPath(
  organizationId: string,
  documentId: string,
  fileName: string,
): string {
  return `${organizationId}/${documentId}/${sanitizeFileName(fileName)}`;
}

export function buildExtractedTextPath(organizationId: string, documentId: string): string {
  return `${organizationId}/${documentId}/${EXTRACTED_TEXT_OBJECT_NAME}`;
}
