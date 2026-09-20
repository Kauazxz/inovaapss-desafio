/**
 * Chamadas e hooks (TanStack Query) da importação de dados (§37 Imports).
 *
 * O upload é multipart e usa `fetch` direto (o `apiFetch` só serializa JSON); o token vem do
 * AuthContext quando a tela está dentro do AuthProvider — nos testes, sem provider, vai sem token.
 *
 * Os tipos abaixo são o contrato com `apps/api/src/modules/imports/types.ts`. A leitura e a
 * validação das planilhas acontecem na API: o navegador nunca carrega o @inovaapss/importer.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useContext } from 'react';

import type { ConfirmImportInput, ImportMapping, PreviewImportBody } from '@inovaapss/validation';

import { AuthContext } from '@/features/auth/auth-context';
import { API_URL, ApiError, apiFetch } from '@/lib/api';

export type ImportFileType = 'XLSX' | 'CSV' | 'JSON';
export type ImportDatasetKey = 'clients' | 'monthly_metrics' | 'nps' | 'client_status';
export type ImportJobStatus = 'uploaded' | 'mapped' | 'previewed' | 'importing' | 'done' | 'failed';
export type ImportErrorCode =
  | 'MISSING_REQUIRED'
  | 'INVALID_TEXT'
  | 'INVALID_NUMBER'
  | 'INVALID_INTEGER'
  | 'INVALID_PERIOD'
  | 'INVALID_DATE'
  | 'INVALID_BOOLEAN'
  | 'INVALID_ENUM'
  | 'OUT_OF_RANGE'
  | 'INCONSISTENT'
  | 'DUPLICATE'
  | 'INVALID_VALUE';

export interface ImportSummary {
  total: number;
  valid: number;
  invalid: number;
  duplicates: number;
  missingFields: string[];
  errorCount: number;
}

export interface ImportJob {
  id: string;
  organizationId: string;
  fileName: string;
  fileType: ImportFileType;
  sizeBytes: number;
  status: ImportJobStatus;
  sheetName: string | null;
  dataset: ImportDatasetKey | null;
  mapping: ImportMapping | null;
  summary: ImportSummary | null;
  rowsImported: number;
  errorMessage: string | null;
  createdBy: string;
  confirmedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface FieldSuggestion {
  field: string;
  label: string;
  required: boolean;
  header: string | null;
  /** 0–1: 1 = nome idêntico, 0,95 = sinônimo exato, abaixo disso é palpite. */
  confidence: number;
  reason: 'exact' | 'synonym' | 'partial' | 'tokens' | 'none';
}

export interface DatasetSuggestion {
  dataset: ImportDatasetKey;
  label: string;
  confidence: number;
  mapping: ImportMapping;
  fields: FieldSuggestion[];
  unmappedHeaders: string[];
  missingRequired: string[];
}

export interface ImportSheet {
  name: string;
  headers: string[];
  rowCount: number;
  sampleRows: Record<string, string | null>[];
  suggestions: DatasetSuggestion[];
}

export interface ImportRowErrorItem {
  id?: string;
  row: number;
  field: string | null;
  code: ImportErrorCode;
  message: string;
  rawData: Record<string, unknown> | null;
}

export interface UploadImportResult {
  job: ImportJob;
  sheets: ImportSheet[];
}

export interface ImportJobDetail {
  job: ImportJob;
  sheets: ImportSheet[] | null;
}

export interface PreviewImportResult {
  job: ImportJob;
  summary: ImportSummary;
  errors: ImportRowErrorItem[];
  sampleRows: Record<string, unknown>[];
}

export interface SkippedRow {
  row: number;
  externalCode: string;
  reason: string;
}

export interface ApplyResult {
  rows: number;
  recordsCreated: number;
  recordsUpdated: number;
  skipped: SkippedRow[];
}

export interface ConfirmImportResult {
  job: ImportJob;
  summary: ImportSummary;
  imported: ApplyResult;
  recalculated: { ok: boolean; reason?: string; clients?: number };
}

export interface DatasetCatalogField {
  key: string;
  label: string;
  type: string;
  required: boolean;
  description?: string;
}

export interface DatasetCatalogItem {
  key: ImportDatasetKey;
  label: string;
  description: string;
  naturalKey: string[];
  fields: DatasetCatalogField[];
}

export interface ImportJobPage {
  items: ImportJob[];
  page: number;
  pageSize: number;
  total: number;
}

export interface ImportRowErrorPage {
  items: ImportRowErrorItem[];
  page: number;
  pageSize: number;
  total: number;
}

export const importKeys = {
  all: ['imports'] as const,
  list: (page: number) => ['imports', 'list', page] as const,
  detail: (id: string) => ['imports', 'detail', id] as const,
  errors: (id: string, page: number) => ['imports', 'detail', id, 'errors', page] as const,
  datasets: () => ['imports', 'datasets'] as const,
};

export function fetchImports(page: number, pageSize: number): Promise<ImportJobPage> {
  const params = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
  return apiFetch<ImportJobPage>(`/api/v1/imports?${params.toString()}`);
}

export function fetchImport(id: string): Promise<ImportJobDetail> {
  return apiFetch<ImportJobDetail>(`/api/v1/imports/${id}`);
}

export function fetchImportErrors(id: string, page: number): Promise<ImportRowErrorPage> {
  const params = new URLSearchParams({ page: String(page) });
  return apiFetch<ImportRowErrorPage>(`/api/v1/imports/${id}/errors?${params.toString()}`);
}

export async function fetchDatasets(): Promise<DatasetCatalogItem[]> {
  const { items } = await apiFetch<{ items: DatasetCatalogItem[] }>('/api/v1/imports/datasets');
  return items;
}

export function previewImport(id: string, body: PreviewImportBody): Promise<PreviewImportResult> {
  return apiFetch<PreviewImportResult>(`/api/v1/imports/${id}/preview`, {
    method: 'POST',
    json: body,
  });
}

export function confirmImport(
  id: string,
  body: ConfirmImportInput = {},
): Promise<ConfirmImportResult> {
  return apiFetch<ConfirmImportResult>(`/api/v1/imports/${id}/confirm`, {
    method: 'POST',
    json: body,
  });
}

export async function uploadImport(file: File, token: string | null): Promise<UploadImportResult> {
  const body = new FormData();
  body.append('file', file, file.name);
  const headers = new Headers({ Accept: 'application/json' });
  if (token) headers.set('Authorization', `Bearer ${token}`);

  let response: Response;
  try {
    response = await fetch(`${API_URL}/api/v1/imports`, { method: 'POST', headers, body });
  } catch (cause) {
    throw new Error(
      'Não foi possível enviar o arquivo. Confira sua conexão e se a API está no ar.',
      { cause },
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
  return payload as UploadImportResult;
}

// ---------- Hooks ----------

/** Token da sessão quando há AuthProvider por cima; null fora dele (testes). */
function useSessionToken(): string | null {
  const auth = useContext(AuthContext);
  return auth?.session?.access_token ?? null;
}

export function useImports(page: number, pageSize: number) {
  return useQuery({
    queryKey: importKeys.list(page),
    queryFn: () => fetchImports(page, pageSize),
    placeholderData: (previous) => previous,
  });
}

export function useDatasets() {
  return useQuery({
    queryKey: importKeys.datasets(),
    queryFn: fetchDatasets,
    // O catálogo é estático dentro de uma sessão: não vale buscar de novo a cada passo.
    staleTime: 60 * 60 * 1000,
  });
}

export function useImportErrors(id: string, page: number, enabled: boolean) {
  return useQuery({
    queryKey: importKeys.errors(id, page),
    queryFn: () => fetchImportErrors(id, page),
    enabled,
  });
}

export function useUploadImport() {
  const queryClient = useQueryClient();
  const token = useSessionToken();
  return useMutation({
    mutationFn: (file: File) => uploadImport(file, token),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: importKeys.all }),
  });
}

export function usePreviewImport() {
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: PreviewImportBody }) => previewImport(id, body),
  });
}

export function useConfirmImport() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body?: ConfirmImportInput }) =>
      confirmImport(id, body),
    onSuccess: () => {
      // Os dados da carteira mudaram: dashboard, clientes e alertas precisam ser buscados de novo.
      void queryClient.invalidateQueries({ queryKey: importKeys.all });
      void queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      void queryClient.invalidateQueries({ queryKey: ['clients'] });
      void queryClient.invalidateQueries({ queryKey: ['alerts'] });
    },
  });
}
