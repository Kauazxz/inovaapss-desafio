/**
 * DocumentStorage em memória: mesmo contrato do Supabase Storage, sem rede. Usado pelos testes
 * e útil para rodar a API sem Supabase configurado em desenvolvimento.
 */
import type { DocumentStorage } from './document-storage.js';

export interface InMemoryDocumentStorage extends DocumentStorage {
  /** Objetos gravados, por caminho (os testes inspecionam). */
  readonly objects: Map<string, { body: Buffer; contentType: string }>;
}

export function createInMemoryDocumentStorage(): InMemoryDocumentStorage {
  const objects = new Map<string, { body: Buffer; contentType: string }>();
  return {
    objects,
    async upload({ path, body, contentType }) {
      objects.set(path, { body: Buffer.from(body), contentType });
      return { path };
    },
    async download(path) {
      const found = objects.get(path);
      if (found === undefined) {
        throw new Error(`Objeto não encontrado no armazenamento em memória: ${path}`);
      }
      return Buffer.from(found.body);
    },
    async createSignedUrl(path, expiresInSeconds) {
      if (!objects.has(path)) {
        throw new Error(`Objeto não encontrado no armazenamento em memória: ${path}`);
      }
      return `memory://${path}?expires=${expiresInSeconds}`;
    },
    async remove(paths) {
      for (const path of paths) objects.delete(path);
    },
  };
}
