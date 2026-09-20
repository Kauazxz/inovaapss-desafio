/**
 * Chamadas e hooks (TanStack Query) da importação de dados (§37 Imports).
 *
 * Os tipos vêm de `@inovaapss/shared`: são os mesmos que a API devolve, então a tela não
 * redeclara nada. O upload é multipart e usa `fetch` direto (o `apiFetch` só serializa JSON); o
 * token vem do AuthContext quando a tela está dentro do AuthProvider — nos testes, sem provider,
 * vai sem token.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useContext } from 'react';

import type {
  ImportConfirmDto,
  ImportDatasetKey,
  ImportJobDetailDto,
  ImportJobPageDto,
  ImportPreviewDto,
  ImportUploadDto,
} from '@inovaapss/shared';

import { AuthContext } from '@/features/auth/auth-context';
import { API_URL, ApiError, apiFetch } from '@/lib/api';

/** Uma tabela do arquivo com o conjunto de dados e o mapeamento escolhidos na tela. */
export interface SheetSelection {
  sheet: string;
  dataset: ImportDatasetKey;
  mapping?: Record<string, string | null>;
}

export interface ImportsQuery {
  page: number;
  pageSize?: number | undefined;
}

export const importKeys = {
  all: ['imports'] as const,
  list: (query: ImportsQuery) => ['imports', 'list', query] as const,
  detail: (id: string) => ['imports', 'detail', id] as const,
};

export function fetchImports(query: ImportsQuery): Promise<ImportJobPageDto> {
  const params = new URLSearchParams({ page: String(query.page) });
  if (query.pageSize !== undefined) params.set('pageSize', String(query.pageSize));
  return apiFetch<ImportJobPageDto>(`/api/v1/imports?${params.toString()}`);
}

export function fetchImport(id: string): Promise<ImportJobDetailDto> {
  return apiFetch<ImportJobDetailDto>(`/api/v1/imports/${id}`);
}

export async function uploadImport(file: File, token: string | null): Promise<ImportUploadDto> {
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
  return payload as ImportUploadDto;
}

export function previewImport(
  id: string,
  sheets?: readonly SheetSelection[],
): Promise<ImportPreviewDto> {
  return apiFetch<ImportPreviewDto>(`/api/v1/imports/${id}/preview`, {
    method: 'POST',
    json: sheets === undefined ? {} : { sheets },
  });
}

export function confirmImport(
  id: string,
  sheets?: readonly SheetSelection[],
): Promise<ImportConfirmDto> {
  return apiFetch<ImportConfirmDto>(`/api/v1/imports/${id}/confirm`, {
    method: 'POST',
    json: sheets === undefined ? {} : { sheets },
  });
}

// ---------- Hooks ----------

/** Token da sessão quando há AuthProvider por cima; null fora dele (testes). */
function useSessionToken(): string | null {
  const auth = useContext(AuthContext);
  return auth?.session?.access_token ?? null;
}

export function useImports(query: ImportsQuery) {
  return useQuery({
    queryKey: importKeys.list(query),
    queryFn: () => fetchImports(query),
    placeholderData: (previous) => previous,
  });
}

export function useImport(id: string, enabled = true) {
  return useQuery({
    queryKey: importKeys.detail(id),
    queryFn: () => fetchImport(id),
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

/** `sheets` ausente OU undefined deixa a API detectar e sugerir sozinha. */
export interface ImportStepInput {
  id: string;
  sheets?: readonly SheetSelection[] | undefined;
}

export function usePreviewImport() {
  return useMutation({
    mutationFn: (input: ImportStepInput) => previewImport(input.id, input.sheets),
  });
}

export function useConfirmImport() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: ImportStepInput) => confirmImport(input.id, input.sheets),
    // Importar muda clientes, dashboard e alertas: nada do cache continua válido.
    onSuccess: () => queryClient.invalidateQueries(),
  });
}
