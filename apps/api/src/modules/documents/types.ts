import type { MetricDirection, MetricType } from '@inovaapss/shared';
import type {
  DocumentKind,
  DocumentStatus,
  MetricSuggestionStatus,
  SuggestedThresholds,
} from '@inovaapss/validation';

/** Documento como a API devolve (sem caminhos internos do storage). */
export interface UploadedDocument {
  id: string;
  organizationId: string;
  fileName: string;
  mimeType: string;
  kind: DocumentKind;
  sizeBytes: number;
  status: DocumentStatus;
  uploadedBy: string;
  /** true quando o texto completo já foi extraído e está no storage. */
  hasExtractedText: boolean;
  /** Primeiros 20 kB do texto extraído (null antes da extração). */
  extractedTextPreview: string | null;
  extractionError: string | null;
  extractedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

/** Linha completa, só para o service (inclui onde o arquivo está no bucket). */
export interface UploadedDocumentRecord extends UploadedDocument {
  storagePath: string;
  extractedTextPath: string | null;
}

export interface UploadedDocumentDetail extends UploadedDocument {
  /** URL assinada de download, válida por `downloadUrlExpiresInSeconds`. */
  downloadUrl: string;
  downloadUrlExpiresInSeconds: number;
}

export interface MetricSuggestion {
  id: string;
  uploadedDocumentId: string;
  organizationId: string;
  suggestedName: string;
  description: string | null;
  suggestedType: MetricType;
  suggestedDirection: MetricDirection;
  unit: string | null;
  suggestedWeight: number | null;
  suggestedFormula: Record<string, unknown> | null;
  suggestedThresholds: SuggestedThresholds | null;
  confidence: number | null;
  sourceExcerpt: string | null;
  provider: string;
  status: MetricSuggestionStatus;
  createdBy: string | null;
  reviewedBy: string | null;
  reviewedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

/**
 * Payload pronto para POST /metrics (Etapa 3), devolvido ao aceitar uma sugestão. O web leva
 * este objeto em `state.prefill` ao navegar para /metrics; a métrica só nasce quando a pessoa
 * confirma lá (§35: nada é ativado automaticamente).
 */
export interface MetricPrefill {
  name: string;
  slug: string;
  description: string | null;
  category: string;
  metricType: MetricType;
  unit: string | null;
  direction: MetricDirection;
  sourceType: 'DOCUMENT';
  periodicity: 'MONTHLY';
  weight: number | null;
  normalization: SuggestedThresholds | null;
  formula: Record<string, unknown> | null;
  isActive: false;
  origin: { documentId: string; suggestionId: string; fileName: string | null };
}

export interface AcceptSuggestionResult {
  suggestion: MetricSuggestion;
  metricPayload: MetricPrefill;
}

export interface UploadDocumentInput {
  fileName: string;
  mimeType: string;
  buffer: Buffer;
}

export interface ExtractMetricsResult {
  document: UploadedDocument;
  suggestions: MetricSuggestion[];
  extraction: {
    provider: string;
    chars: number;
    truncated: boolean;
    pages?: number | undefined;
    sheets?: number | undefined;
    rows?: number | undefined;
  };
}

export interface PaginatedDocuments {
  items: UploadedDocument[];
  page: number;
  pageSize: number;
  total: number;
}
