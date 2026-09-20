/**
 * Schemas das rotas do Agente IA (§37). A pergunta é texto livre, então o limite de tamanho é a
 * primeira defesa: contra custo e contra alguém tentar empurrar um documento inteiro pelo campo.
 */
import { z } from 'zod';

import { uuidSchema } from '@inovaapss/validation';

export const ASSISTANT_QUESTION_MAX = 2000;
export const ASSISTANT_HISTORY_MAX = 20;

export const assistantMessageSchema = z.object({
  role: z.enum(['user', 'assistant']),
  content: z.string().trim().min(1).max(ASSISTANT_QUESTION_MAX),
});

export const askAssistantSchema = z.object({
  question: z
    .string()
    .trim()
    .min(3, 'Escreva a pergunta com pelo menos 3 caracteres.')
    .max(
      ASSISTANT_QUESTION_MAX,
      `A pergunta pode ter no máximo ${ASSISTANT_QUESTION_MAX} caracteres.`,
    ),
  /** Documento da organização para o Agente considerar junto do relatório. */
  documentId: uuidSchema.optional(),
  /** Conversa anterior, enviada pelo cliente (o servidor não guarda sessão). */
  history: z.array(assistantMessageSchema).max(ASSISTANT_HISTORY_MAX).optional(),
});

export type AskAssistantBody = z.infer<typeof askAssistantSchema>;
export type AssistantMessage = z.infer<typeof assistantMessageSchema>;
