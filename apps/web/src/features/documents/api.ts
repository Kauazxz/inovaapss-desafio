/**
 * Chamadas e hooks (TanStack Query) da feature de documentos (§37 Documents).
 *
 * O upload é multipart e usa `fetch` direto (o `apiFetch` só serializa JSON); o token vem do
 * AuthContext quando a tela está dentro do AuthProvider — nos testes, sem provider, vai sem token.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useContext } from 'react';

import type { MetricDirection, MetricType } from '@inovaapss/shared';
import type {
  CreateMetricSuggestionBody,
  DocumentKind,
  DocumentStatus,
  MetricSuggestionStatus,
  SuggestedThresholds,
} from '@inovaapss/validation';

import { AuthContext } from '@/features/auth/auth-context';
import { API_URL, ApiError, apiFetch } from '@/lib/api';

export interface UploadedDocument {
  id: string;
  organizationId: string;
  fileName: string;
  mimeType: string;
  kind: DocumentKind;
  sizeBytes: number;
  status: DocumentStatus;
  uploadedBy: string;
  hasExtractedText: boolean;
  extractedTextPreview: string | null;
  extractionError: string | null;
  extractedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface UploadedDocumentDetail extends UploadedDocument {
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

/** Payload que POST /metric-suggestions/:id/accept devolve, levado a /metrics em state.prefill. */
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

export interface DocumentPage {
  items: UploadedDocument[];
  page: number;
  pageSize: number;
  total: number;
}

export interface ExtractMetricsResult {
  document: UploadedDocument;
  suggestions: MetricSuggestion[];
  extraction: { provider: string; chars: number; truncated: boolean };
}

export interface AcceptSuggestionResult {
  suggestion: MetricSuggestion;
  metricPayload: MetricPrefill;
}

export interface DocumentsQuery {
  page: number;
  pageSize?: number | undefined;
  search?: string | undefined;
}

export const documentKeys = {
  all: ['documents'] as const,
  list: (query: DocumentsQuery) => ['documents', 'list', query] as const,
  detail: (id: string) => ['documents', 'detail', id] as const,
  suggestions: (id: string) => ['documents', 'detail', id, 'suggestions'] as const,
};

export function fetchDocuments(query: DocumentsQuery): Promise<DocumentPage> {
  const params = new URLSearchParams({ page: String(query.page) });
  if (query.pageSize !== undefined) params.set('pageSize', String(query.pageSize));
  if (query.search) params.set('search', query.search);
  return apiFetch<DocumentPage>(`/api/v1/documents?${params.toString()}`);
}

export async function fetchDocument(id: string): Promise<UploadedDocumentDetail> {
  const { document } = await apiFetch<{ document: UploadedDocumentDetail }>(
    `/api/v1/documents/${id}`,
  );
  return document;
}

export async function fetchSuggestions(id: string): Promise<MetricSuggestion[]> {
  const { items } = await apiFetch<{ items: MetricSuggestion[] }>(
    `/api/v1/documents/${id}/suggestions`,
  );
  return items;
}

export async function uploadDocument(file: File, token: string | null): Promise<UploadedDocument> {
  const body = new FormData();
  body.append('file', file, file.name);
  const headers = new Headers({ Accept: 'application/json' });
  if (token) headers.set('Authorization', `Bearer ${token}`);

  let response: Response;
  try {
    response = await fetch(`${API_URL}/api/v1/documents`, { method: 'POST', headers, body });
  } catch (cause) {
    throw new Error(
      'Não foi possível enviar o arquivo. Confira sua conexão e se a API está no ar.',
      {
        cause,
      },
    );
  }
  const text = await response.text();
  let payload: unknown;
  try {
    payload = text === '' ? null : JSON.parse(text);
  } catch {
    payload = null;
  }
  if (!response.ok) {
    const error = (payload as { error?: { code?: string; message?: string } } | null)?.error;
    throw new ApiError(response.status, {
      code: error?.code ?? 'HTTP_ERROR',
      message: error?.message ?? `A API respondeu ${response.status} sem detalhar o erro.`,
    });
  }
  return (payload as { document: UploadedDocument }).document;
}

export function extractMetrics(id: string): Promise<ExtractMetricsResult> {
  return apiFetch<ExtractMetricsResult>(`/api/v1/documents/${id}/extract-metrics`, {
    method: 'POST',
  });
}

export async function createSuggestion(
  id: string,
  body: CreateMetricSuggestionBody,
): Promise<MetricSuggestion> {
  const { suggestion } = await apiFetch<{ suggestion: MetricSuggestion }>(
    `/api/v1/documents/${id}/suggestions`,
    { method: 'POST', json: body },
  );
  return suggestion;
}

export function acceptSuggestion(id: string): Promise<AcceptSuggestionResult> {
  return apiFetch<AcceptSuggestionResult>(`/api/v1/metric-suggestions/${id}/accept`, {
    method: 'POST',
  });
}

export async function rejectSuggestion(id: string): Promise<MetricSuggestion> {
  const { suggestion } = await apiFetch<{ suggestion: MetricSuggestion }>(
    `/api/v1/metric-suggestions/${id}/reject`,
    { method: 'POST' },
  );
  return suggestion;
}

// ---------- Hooks ----------

export function useDocuments(query: DocumentsQuery) {
  return useQuery({
    queryKey: documentKeys.list(query),
    queryFn: () => fetchDocuments(query),
    placeholderData: (previous) => previous,
  });
}

export function useDocument(id: string) {
  return useQuery({ queryKey: documentKeys.detail(id), queryFn: () => fetchDocument(id) });
}

export function useSuggestions(id: string) {
  return useQuery({
    queryKey: documentKeys.suggestions(id),
    queryFn: () => fetchSuggestions(id),
  });
}

/** Token da sessão quando há AuthProvider por cima; null fora dele (testes). */
function useSessionToken(): string | null {
  const auth = useContext(AuthContext);
  return auth?.session?.access_token ?? null;
}

export function useUploadDocument() {
  const queryClient = useQueryClient();
  const token = useSessionToken();
  return useMutation({
    mutationFn: (file: File) => uploadDocument(file, token),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: documentKeys.all }),
  });
}

export function useExtractMetrics(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => extractMetrics(id),
    onSettled: () => queryClient.invalidateQueries({ queryKey: documentKeys.detail(id) }),
  });
}

export function useCreateSuggestion(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: CreateMetricSuggestionBody) => createSuggestion(id, body),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: documentKeys.suggestions(id) }),
  });
}

export function useReviewSuggestion(documentId: string) {
  const queryClient = useQueryClient();
  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: documentKeys.suggestions(documentId) });
  const accept = useMutation({ mutationFn: acceptSuggestion, onSuccess: invalidate });
  const reject = useMutation({ mutationFn: rejectSuggestion, onSuccess: invalidate });
  return { accept, reject };
}
