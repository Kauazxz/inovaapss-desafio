/** Formas que as rotas do Agente IA devolvem. Contrato com apps/web/src/features/assistant/. */
import type { AssistantCanvas } from '@inovaapss/shared';

export interface AssistantStatus {
  /** false quando OPENAI_API_KEY não está configurada: a tela avisa em vez de quebrar. */
  configured: boolean;
  model: string | null;
  /** true quando o Agente consegue ler um documento enviado (§35). */
  canReadDocuments: boolean;
}

export interface AskAssistantResult {
  answer: string;
  model: string;
  /** Painel visual com dados verificados; a IA escolhe o preset, a API preenche os números. */
  canvas: AssistantCanvas;
  /** O que sustentou a resposta — a tela mostra para a pessoa saber sobre o que ele respondeu. */
  context: {
    clientsInRanking: number;
    periodEnd: string;
    documentName: string | null;
  };
  usage?: { promptTokens: number; completionTokens: number };
}
