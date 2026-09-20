/**
 * Costura com a importação de dados (§34) para o arquivo da organização (§35).
 *
 * As planilhas enviadas pela tela de importação ficam num bucket próprio ("imports"), gravado
 * por outro módulo. O arquivo da organização precisa mostrá-las junto com os documentos
 * enviados aqui, então esta leitura varre o bucket e registra o que ainda não está em
 * `uploaded_documents` com `origin = 'import'`. A operação é idempotente: a chave
 * (organization_id, storage_path) descarta o que já foi registrado.
 *
 * Se o módulo de importação passar a gravar a linha (com `import_job_id`), nada muda aqui: a
 * varredura simplesmente não encontra nada novo. Ver a pendência em docs/DOCUMENTS.md §8.
 */
import { randomUUID } from 'node:crypto';

import { resolveUploadType } from '@inovaapss/validation';

import type { NewDocumentInput } from './repository.js';

/** Quanto tempo uma varredura vale antes de a listagem olhar o bucket de novo. */
export const IMPORT_ARCHIVE_SYNC_TTL_MS = 30_000;

/** Teto de arquivos considerados por varredura, para não segurar a listagem. */
const MAX_OBJECTS_PER_SYNC = 200;

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** `org/job/planilha.xlsx` → `planilha.xlsx`. */
export function fileNameOfPath(path: string): string {
  return path.split('/').pop() ?? path;
}

/**
 * Convenção esperada: `<organizationId>/<importJobId>/<arquivo>`. Quando o segundo segmento não
 * é um uuid, o arquivo entra sem job — o vínculo fica para o integrador (docs/DOCUMENTS.md §8).
 */
export function importJobIdOfPath(organizationId: string, path: string): string | null {
  const segments = path.split('/');
  if (segments[0] !== organizationId) return null;
  const candidate = segments.length > 2 ? segments[1] : undefined;
  return candidate !== undefined && UUID_PATTERN.test(candidate) ? candidate : null;
}

/**
 * Objetos do bucket da importação → linhas prontas para `registerImportedDocuments`. Arquivos
 * com extensão fora da allowlist (§45) ficam de fora: o arquivo da organização só guarda o que
 * sabe abrir.
 */
export function toImportedDocumentInputs(
  organizationId: string,
  objects: readonly {
    path: string;
    sizeBytes: number;
    mimeType: string;
    createdAt: string | null;
  }[],
): NewDocumentInput[] {
  const inputs: NewDocumentInput[] = [];
  for (const object of objects.slice(0, MAX_OBJECTS_PER_SYNC)) {
    const fileName = fileNameOfPath(object.path);
    const resolved = resolveUploadType(fileName, object.mimeType);
    if (!resolved.ok) continue;
    const createdAt = object.createdAt === null ? undefined : new Date(object.createdAt);
    inputs.push({
      id: randomUUID(),
      organizationId,
      storagePath: object.path,
      fileName,
      mimeType: resolved.mimeType,
      sizeBytes: Math.max(0, Math.trunc(object.sizeBytes)),
      uploadedBy: null,
      origin: 'import',
      importJobId: importJobIdOfPath(organizationId, object.path),
      ...(createdAt === undefined || Number.isNaN(createdAt.getTime()) ? {} : { createdAt }),
    });
  }
  return inputs;
}

/** Marca o último momento em que cada organização teve o bucket varrido. */
export function createSyncClock(ttlMs = IMPORT_ARCHIVE_SYNC_TTL_MS, now = () => Date.now()) {
  const lastSync = new Map<string, number>();
  return {
    due(organizationId: string): boolean {
      const previous = lastSync.get(organizationId);
      return previous === undefined || now() - previous >= ttlMs;
    },
    touch(organizationId: string): void {
      lastSync.set(organizationId, now());
    },
  };
}
