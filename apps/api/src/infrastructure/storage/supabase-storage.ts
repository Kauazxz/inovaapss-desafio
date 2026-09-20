/**
 * DocumentStorage sobre o Supabase Storage, com o client admin (service_role — só no backend).
 *
 * - Bucket PRIVADO "documents": criado sob demanda na primeira operação, nunca público. O
 *   navegador só chega ao arquivo por URL assinada de validade curta (GET /documents/:id).
 * - O bucket também recebe o limite de tamanho e a allowlist de MIME (§45), como segunda
 *   barreira além da validação da API.
 */
import { ALLOWED_UPLOAD_MIME_TYPES } from '@inovaapss/shared';
import { MAX_UPLOAD_BYTES } from '@inovaapss/validation';

import { AppError } from '../../shared/errors.js';

import type { DocumentStorage } from './document-storage.js';
import type { SupabaseClient } from '@supabase/supabase-js';

export const DOCUMENTS_BUCKET = 'documents';

export class StorageError extends AppError {
  constructor(message: string) {
    super(502, 'STORAGE_ERROR', message);
    this.name = 'StorageError';
  }
}

export interface SupabaseDocumentStorageOptions {
  /** Client com service_role (SupabaseClients.getAdmin). Resolvido a cada uso: lazy. */
  getClient: () => SupabaseClient;
  bucket?: string;
}

export function createSupabaseDocumentStorage(
  options: SupabaseDocumentStorageOptions,
): DocumentStorage {
  const bucket = options.bucket ?? DOCUMENTS_BUCKET;
  let bucketReady: Promise<void> | undefined;

  const ensureBucket = (): Promise<void> => {
    if (bucketReady === undefined) {
      bucketReady = (async () => {
        const client = options.getClient();
        const existing = await client.storage.getBucket(bucket);
        if (!existing.error && existing.data) {
          if (existing.data.public) {
            throw new StorageError(
              `O bucket "${bucket}" está público; documentos exigem bucket privado.`,
            );
          }
          return;
        }
        const created = await client.storage.createBucket(bucket, {
          public: false,
          fileSizeLimit: MAX_UPLOAD_BYTES,
          allowedMimeTypes: [...ALLOWED_UPLOAD_MIME_TYPES],
        });
        if (created.error && !/already exists/i.test(created.error.message)) {
          throw new StorageError(`Não foi possível criar o bucket "${bucket}".`);
        }
      })().catch((err: unknown) => {
        // Falhou: a próxima chamada tenta de novo em vez de ficar presa num erro antigo.
        bucketReady = undefined;
        throw err;
      });
    }
    return bucketReady;
  };

  const files = () => options.getClient().storage.from(bucket);

  return {
    async upload({ path, body, contentType }) {
      await ensureBucket();
      const { error } = await files().upload(path, body, { contentType, upsert: true });
      if (error) {
        throw new StorageError('Não foi possível gravar o arquivo no armazenamento.');
      }
      return { path };
    },

    async download(path) {
      await ensureBucket();
      const { data, error } = await files().download(path);
      if (error || !data) {
        throw new StorageError('Não foi possível ler o arquivo do armazenamento.');
      }
      return Buffer.from(await data.arrayBuffer());
    },

    async createSignedUrl(path, expiresInSeconds) {
      await ensureBucket();
      const { data, error } = await files().createSignedUrl(path, expiresInSeconds);
      if (error || !data) {
        throw new StorageError('Não foi possível gerar a URL de download.');
      }
      return data.signedUrl;
    },

    async remove(paths) {
      if (paths.length === 0) return;
      await ensureBucket();
      const { error } = await files().remove([...paths]);
      if (error) {
        throw new StorageError('Não foi possível remover o arquivo do armazenamento.');
      }
    },
  };
}
