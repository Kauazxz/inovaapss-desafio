/**
 * Repositório em memória de documentos e sugestões: mesma interface do repositório Drizzle,
 * sem banco. Filtra sempre por organization_id, como o real.
 */
import { randomUUID } from 'node:crypto';

import { documentKindOf, toPublicDocument } from '../repository.js';

import type { DocumentsRepository } from '../repository.js';
import type { MetricSuggestion, UploadedDocumentRecord } from '../types.js';

export interface FakeDocumentsRepository extends DocumentsRepository {
  documents: UploadedDocumentRecord[];
  suggestions: MetricSuggestion[];
}

export function createFakeDocumentsRepository(): FakeDocumentsRepository {
  const documents: UploadedDocumentRecord[] = [];
  const suggestions: MetricSuggestion[] = [];
  let tick = 0;
  const stamp = () => new Date(Date.UTC(2026, 8, 19, 12, 0, tick++)).toISOString();

  return {
    documents,
    suggestions,

    async createDocument(input) {
      const now = stamp();
      const record: UploadedDocumentRecord = {
        id: input.id,
        organizationId: input.organizationId,
        fileName: input.fileName,
        mimeType: input.mimeType,
        kind: documentKindOf(input.fileName),
        sizeBytes: input.sizeBytes,
        status: 'uploaded',
        uploadedBy: input.uploadedBy,
        hasExtractedText: false,
        extractedTextPreview: null,
        extractionError: null,
        extractedAt: null,
        createdAt: now,
        updatedAt: now,
        storagePath: input.storagePath,
        extractedTextPath: null,
      };
      documents.push(record);
      return { ...record };
    },

    async findDocument(organizationId, id) {
      const found = documents.find((d) => d.organizationId === organizationId && d.id === id);
      return found === undefined ? null : { ...found };
    },

    async listDocuments(organizationId, query) {
      let rows = documents.filter((d) => d.organizationId === organizationId);
      if (query.status !== undefined) rows = rows.filter((d) => d.status === query.status);
      if (query.search) {
        const needle = query.search.toLowerCase();
        rows = rows.filter((d) => d.fileName.toLowerCase().includes(needle));
      }
      const direction = query.sort === undefined ? 'desc' : query.order;
      const key = (query.sort ?? 'createdAt') as 'createdAt' | 'fileName' | 'status' | 'sizeBytes';
      rows = [...rows].sort((a, b) => {
        const left = a[key];
        const right = b[key];
        const cmp = left < right ? -1 : left > right ? 1 : 0;
        return direction === 'desc' ? -cmp : cmp;
      });
      const start = (query.page - 1) * query.pageSize;
      return {
        items: rows.slice(start, start + query.pageSize).map(toPublicDocument),
        total: rows.length,
      };
    },

    async updateDocument(organizationId, id, patch) {
      const found = documents.find((d) => d.organizationId === organizationId && d.id === id);
      if (found === undefined) return null;
      if (patch.status !== undefined) found.status = patch.status;
      if (patch.extractedTextPath !== undefined) {
        found.extractedTextPath = patch.extractedTextPath;
        found.hasExtractedText = patch.extractedTextPath !== null;
      }
      if (patch.extractedTextPreview !== undefined) {
        found.extractedTextPreview = patch.extractedTextPreview;
      }
      if (patch.extractionError !== undefined) found.extractionError = patch.extractionError;
      if (patch.extractedAt !== undefined) {
        found.extractedAt = patch.extractedAt === null ? null : patch.extractedAt.toISOString();
      }
      found.updatedAt = stamp();
      return { ...found };
    },

    async deleteDocument(organizationId, id) {
      const index = documents.findIndex((d) => d.organizationId === organizationId && d.id === id);
      if (index >= 0) documents.splice(index, 1);
    },

    async createSuggestions(inputs) {
      const created = inputs.map((input): MetricSuggestion => {
        const now = stamp();
        return {
          id: randomUUID(),
          uploadedDocumentId: input.uploadedDocumentId,
          organizationId: input.organizationId,
          suggestedName: input.suggestedName,
          description: input.description ?? null,
          suggestedType: input.suggestedType,
          suggestedDirection: input.suggestedDirection,
          unit: input.unit ?? null,
          suggestedWeight: input.suggestedWeight ?? null,
          suggestedFormula: input.suggestedFormula ?? null,
          suggestedThresholds: input.suggestedThresholds ?? null,
          confidence: input.confidence ?? null,
          sourceExcerpt: input.sourceExcerpt ?? null,
          provider: input.provider,
          status: 'pending',
          createdBy: input.createdBy ?? null,
          reviewedBy: null,
          reviewedAt: null,
          createdAt: now,
          updatedAt: now,
        };
      });
      suggestions.push(...created);
      return created.map((s) => ({ ...s }));
    },

    async listSuggestions(organizationId, documentId) {
      return suggestions
        .filter((s) => s.organizationId === organizationId && s.uploadedDocumentId === documentId)
        .map((s) => ({ ...s }));
    },

    async findSuggestion(organizationId, id) {
      const found = suggestions.find((s) => s.organizationId === organizationId && s.id === id);
      return found === undefined ? null : { ...found };
    },

    async reviewSuggestion(organizationId, id, review) {
      const found = suggestions.find((s) => s.organizationId === organizationId && s.id === id);
      if (found === undefined) return null;
      found.status = review.status;
      found.reviewedBy = review.reviewedBy;
      found.reviewedAt = review.reviewedAt.toISOString();
      found.updatedAt = review.reviewedAt.toISOString();
      return { ...found };
    },
  };
}
