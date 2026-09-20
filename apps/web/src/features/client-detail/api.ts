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

import {
  buildMockClientEvidence,
  buildMockClientHistory,
  buildMockClientOverview,
  buildMockClientRecommendations,
  buildMockClientScores,
} from '@/lib/mock/client-detail';

/** De onde os dados vêm hoje. A tela mostra uma pílula enquanto for 'mock'. */
export const CLIENT_DETAIL_DATA_SOURCE: 'mock' | 'api' = 'mock';

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
  // API real: return apiFetch<ClientHealthOverview>(`/api/v1/clients/${encodeURIComponent(clientId)}`);
  await Promise.resolve();
  return orNotFound(clientId, buildMockClientOverview(clientId));
}

export async function fetchClientScores(clientId: string): Promise<ClientScoresResponse> {
  // API real: return apiFetch<ClientScoresResponse>(`/api/v1/clients/${encodeURIComponent(clientId)}/scores`);
  await Promise.resolve();
  return orNotFound(clientId, buildMockClientScores(clientId));
}

export async function fetchClientEvidence(clientId: string): Promise<ClientEvidenceResponse> {
  // API real: return apiFetch<ClientEvidenceResponse>(`/api/v1/clients/${encodeURIComponent(clientId)}/evidence`);
  await Promise.resolve();
  return orNotFound(clientId, buildMockClientEvidence(clientId));
}

export async function fetchClientRecommendations(
  clientId: string,
): Promise<ClientRecommendationsResponse> {
  // API real: return apiFetch<ClientRecommendationsResponse>(`/api/v1/clients/${encodeURIComponent(clientId)}/recommendations`);
  await Promise.resolve();
  return orNotFound(clientId, buildMockClientRecommendations(clientId));
}

export async function fetchClientHistory(clientId: string): Promise<ClientHistoryResponse> {
  // API real: return apiFetch<ClientHistoryResponse>(`/api/v1/clients/${encodeURIComponent(clientId)}/history`);
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
