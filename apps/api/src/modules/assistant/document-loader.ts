/**
 * Leitura do texto de um documento para o Agente IA responder sobre ele (§35).
 *
 * O texto completo fica no Storage (`extracted.txt`, gravado por POST
 * /documents/:id/extract-metrics) e um trecho de até 20 kB fica no banco. Aqui a ordem é:
 * tenta o Storage (texto inteiro) e, se não der, usa o trecho do banco — responder com o que
 * existe é melhor do que falhar, desde que o Agente saiba que o texto pode estar cortado.
 *
 * Isolamento (§5): a busca sempre passa o organization_id do tenant, então um id de documento
 * de outra organização simplesmente não é encontrado.
 */
import type { BriefingDocument } from './briefing.js';
import type { AssistantDocumentLoader } from './service.js';
import type { DocumentStorage } from '../../infrastructure/storage/document-storage.js';
import type { TenantContext } from '../../middleware/tenant.js';
import type { DocumentsRepository } from '../documents/repository.js';

export interface AssistantDocumentLoaderOptions {
  repository: DocumentsRepository;
  storage: DocumentStorage;
}

export function createAssistantDocumentLoader(
  options: AssistantDocumentLoaderOptions,
): AssistantDocumentLoader {
  const { repository, storage } = options;

  return {
    async load(tenant: TenantContext, documentId: string): Promise<BriefingDocument | null> {
      const record = await repository.findDocument(tenant.organizationId, documentId);
      if (record === null) return null;

      if (record.extractedTextPath !== null) {
        try {
          const buffer = await storage.download(record.extractedTextPath);
          const text = buffer.toString('utf8').trim();
          if (text !== '') return { fileName: record.fileName, text };
        } catch {
          // Objeto sumiu ou o Storage está fora: cai no trecho guardado no banco.
        }
      }

      const preview = record.extractedTextPreview?.trim() ?? '';
      if (preview === '') return null;
      return { fileName: record.fileName, text: preview };
    },
  };
}
