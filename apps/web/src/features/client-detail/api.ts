/**
 * Busca de dados da visão individual do cliente (§40) via TanStack Query.
 *
 * Hoje devolve o MOCK (`@/lib/mock/client-detail`). Quando a API existir (Etapas 4 + 6 e o
 * módulo `client-health`), cada `fetch*` troca uma linha pela chamada real — o comentário em
 * cada função mostra qual — e a tela não muda, porque os tipos já são os de `@inovaapss/shared`.
 * `null` no mock equivale ao 404 da API (`ApiError` com status 404).
 */
import { useQuery } from '@tanstack/react-query';

import type {
  ClientEvidenceResponse,
  ClientHealthOverview,
  ClientHistoryResponse,
  ClientRecommendationsResponse,
  ClientScoresResponse,
} from '@inovaapss/shared';

import { ApiError, apiFetch } from '@/lib/api';
import {
  buildMockClientEvidence,
  buildMockClientHistory,
  buildMockClientOverview,
  buildMockClientRecommendations,
  buildMockClientScores,
} from '@/lib/mock/client-detail';

/**
 * De onde os dados vêm. Controlado por VITE_DATA_SOURCE (padrão 'api'); com 'mock' a tela usa
 * os dados de exemplo e mostra uma pílula avisando.
 */
export const CLIENT_DETAIL_DATA_SOURCE: 'mock' | 'api' =
  import.meta.env.VITE_DATA_SOURCE === 'mock' ? 'mock' : 'api';

/** Chama a API e traduz o 404 da API no erro que a tela já sabe mostrar. */
async function buscar<T>(clientId: string, caminho: string): Promise<T> {
  try {
    return await apiFetch<T>(`/api/v1/clients/${encodeURIComponent(clientId)}/${caminho}`);
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) throw new ClientNotFoundError(clientId);
    throw err;
  }
}

/** Erro de "cliente não encontrado": a tela mostra o estado vazio com o link de volta. */
export class ClientNotFoundError extends Error {
  readonly clientId: string;
  constructor(clientId: string) {
    super('Cliente não encontrado nesta organização.');
    this.name = 'ClientNotFoundError';
    this.clientId = clientId;
  }
}

function orNotFound<T>(clientId: string, value: T | null): T {
  if (value === null) throw new ClientNotFoundError(clientId);
  return value;
}

export async function fetchClientOverview(clientId: string): Promise<ClientHealthOverview> {
  if (CLIENT_DETAIL_DATA_SOURCE === 'api') {
    return buscar<ClientHealthOverview>(clientId, 'overview');
  }
  await Promise.resolve();
  return orNotFound(clientId, buildMockClientOverview(clientId));
}

export async function fetchClientScores(clientId: string): Promise<ClientScoresResponse> {
  if (CLIENT_DETAIL_DATA_SOURCE === 'api') {
    return buscar<ClientScoresResponse>(clientId, 'scores');
  }
  await Promise.resolve();
  return orNotFound(clientId, buildMockClientScores(clientId));
}

export async function fetchClientEvidence(clientId: string): Promise<ClientEvidenceResponse> {
  if (CLIENT_DETAIL_DATA_SOURCE === 'api') {
    return buscar<ClientEvidenceResponse>(clientId, 'evidence');
  }
  await Promise.resolve();
  return orNotFound(clientId, buildMockClientEvidence(clientId));
}

export async function fetchClientRecommendations(
  clientId: string,
): Promise<ClientRecommendationsResponse> {
  if (CLIENT_DETAIL_DATA_SOURCE === 'api') {
    return buscar<ClientRecommendationsResponse>(clientId, 'recommendations');
  }
  await Promise.resolve();
  return orNotFound(clientId, buildMockClientRecommendations(clientId));
}

export async function fetchClientHistory(clientId: string): Promise<ClientHistoryResponse> {
  if (CLIENT_DETAIL_DATA_SOURCE === 'api') {
    return buscar<ClientHistoryResponse>(clientId, 'history');
  }
  await Promise.resolve();
  return orNotFound(clientId, buildMockClientHistory(clientId));
}

export const clientDetailKeys = {
  all: ['client-detail'] as const,
  overview: (clientId: string) => ['client-detail', clientId, 'overview'] as const,
  scores: (clientId: string) => ['client-detail', clientId, 'scores'] as const,
  evidence: (clientId: string) => ['client-detail', clientId, 'evidence'] as const,
  recommendations: (clientId: string) => ['client-detail', clientId, 'recommendations'] as const,
  history: (clientId: string) => ['client-detail', clientId, 'history'] as const,
};

/** Não insistir num 404: o cliente não existe (ou é de outra organização). */
function retryUnlessNotFound(failureCount: number, error: unknown): boolean {
  if (error instanceof ClientNotFoundError) return false;
  if (typeof error === 'object' && error !== null && (error as { status?: number }).status === 404)
    return false;
  return failureCount < 2;
}

export function useClientOverview(clientId: string) {
  return useQuery({
    queryKey: clientDetailKeys.overview(clientId),
    queryFn: () => fetchClientOverview(clientId),
    retry: retryUnlessNotFound,
  });
}

export function useClientScores(clientId: string) {
  return useQuery({
    queryKey: clientDetailKeys.scores(clientId),
    queryFn: () => fetchClientScores(clientId),
    retry: retryUnlessNotFound,
  });
}

export function useClientEvidence(clientId: string) {
  return useQuery({
    queryKey: clientDetailKeys.evidence(clientId),
    queryFn: () => fetchClientEvidence(clientId),
    retry: retryUnlessNotFound,
  });
}

export function useClientRecommendations(clientId: string) {
  return useQuery({
    queryKey: clientDetailKeys.recommendations(clientId),
    queryFn: () => fetchClientRecommendations(clientId),
    retry: retryUnlessNotFound,
  });
}

export function useClientHistory(clientId: string) {
  return useQuery({
    queryKey: clientDetailKeys.history(clientId),
    queryFn: () => fetchClientHistory(clientId),
    retry: retryUnlessNotFound,
  });
}
