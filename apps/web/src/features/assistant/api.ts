/**
 * Chamadas e hooks do Agente IA (§37 Assistant).
 *
 * O servidor não guarda a conversa: o histórico vive nesta tela e vai junto de cada pergunta.
 * Isso mantém o backend sem sessão e deixa claro para a pessoa o que o Agente está vendo.
 */
import { useMutation, useQuery } from '@tanstack/react-query';

import type { AssistantCanvas } from '@inovaapss/shared';

import { apiFetch } from '@/lib/api';

export interface AssistantStatus {
  configured: boolean;
  model: string | null;
  canReadDocuments: boolean;
}

export interface AssistantMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface AskAssistantResult {
  answer: string;
  model: string;
  canvas: AssistantCanvas;
  context: {
    clientsInRanking: number;
    periodEnd: string;
    documentName: string | null;
  };
  usage?: { promptTokens: number; completionTokens: number };
}

export interface AskAssistantInput {
  question: string;
  documentId?: string | undefined;
  history?: AssistantMessage[] | undefined;
}

export const assistantKeys = {
  status: () => ['assistant', 'status'] as const,
};

export function fetchAssistantStatus(): Promise<AssistantStatus> {
  return apiFetch<AssistantStatus>('/api/v1/assistant/status');
}

export function askAssistant(input: AskAssistantInput): Promise<AskAssistantResult> {
  return apiFetch<AskAssistantResult>('/api/v1/assistant/ask', {
    method: 'POST',
    json: {
      question: input.question,
      ...(input.documentId === undefined ? {} : { documentId: input.documentId }),
      ...(input.history === undefined ? {} : { history: input.history }),
    },
  });
}

export function useAssistantStatus() {
  return useQuery({
    queryKey: assistantKeys.status(),
    queryFn: fetchAssistantStatus,
    staleTime: 5 * 60 * 1000,
  });
}

export function useAskAssistant() {
  return useMutation({ mutationFn: askAssistant });
}
