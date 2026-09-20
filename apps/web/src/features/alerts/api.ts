/**
 * Alertas (§27): a fila de "olhe isto agora" e o envio do resumo por e-mail.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import type { AlertsResponse, AlertStatus } from '@inovaapss/shared';

import { apiFetch } from '@/lib/api';

/** Resposta de POST /alerts/digest/send — pode ter enviado ou só devolvido a prévia. */
export interface DigestSendResult {
  sent: boolean;
  reason?: string;
  to: string;
  subject?: string;
  html?: string;
  text?: string;
}

export const alertKeys = {
  all: ['alerts'] as const,
  list: () => ['alerts', 'list'] as const,
};

export function useAlerts() {
  return useQuery({
    queryKey: alertKeys.list(),
    queryFn: () => apiFetch<AlertsResponse>('/api/v1/alerts'),
    staleTime: 30_000,
  });
}

export function useUpdateAlertStatus() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, status }: { id: string; status: AlertStatus }) =>
      apiFetch(`/api/v1/alerts/${encodeURIComponent(id)}`, { method: 'PATCH', json: { status } }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: alertKeys.all }),
  });
}

export function useSendDigest() {
  return useMutation({
    mutationFn: () =>
      apiFetch<DigestSendResult>('/api/v1/alerts/digest/send', { method: 'POST', json: {} }),
  });
}
