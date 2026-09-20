/**
 * Cliente mínimo da OpenAI (Chat Completions), usado por duas funções do produto:
 *   - a leitura de documentos que propõe métricas (extraction/openai-provider.ts);
 *   - o Agente IA que responde perguntas sobre o relatório (modules/assistant/).
 *
 * Sem SDK de propósito: `fetch` com um contrato explícito é injetável nos testes e não prende o
 * projeto à versão de um pacote que muda rápido. O que este módulo garante:
 *   - a chave vem do env e NUNCA entra em log nem em mensagem de erro;
 *   - o conteúdo enviado (documento, dados do cliente) também não é logado;
 *   - erro da OpenAI vira AppError com mensagem em português, sem vazar corpo da resposta;
 *   - timeout sempre definido, para uma chamada pendurada não segurar a requisição.
 */
import { z } from 'zod';

import { AppError } from '../../shared/errors.js';

export const OPENAI_BASE_URL = 'https://api.openai.com';
export const OPENAI_CHAT_PATH = '/v1/chat/completions';

/** Modelo padrão: lê texto longo bem, aceita saída estruturada e tem custo baixo. */
export const DEFAULT_OPENAI_MODEL = 'gpt-4o-mini';

export class OpenAiError extends AppError {
  constructor(message: string, statusCode = 502) {
    super(statusCode, 'OPENAI_ERROR', message);
    this.name = 'OpenAiError';
  }
}

export class OpenAiNotConfiguredError extends AppError {
  constructor() {
    super(
      503,
      'OPENAI_NOT_CONFIGURED',
      'A IA não está configurada nesta instância. Defina OPENAI_API_KEY no .env do servidor.',
    );
    this.name = 'OpenAiNotConfiguredError';
  }
}

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

/** Saída estruturada: o modelo é obrigado a responder no formato do JSON Schema. */
export interface JsonSchemaFormat {
  name: string;
  schema: Record<string, unknown>;
}

export interface ChatRequest {
  messages: readonly ChatMessage[];
  model?: string | undefined;
  /** 0 = determinístico, que é o que queremos nas duas funções. */
  temperature?: number;
  maxTokens?: number;
  jsonSchema?: JsonSchemaFormat;
}

export interface ChatResult {
  /** Conteúdo da resposta; string vazia quando o modelo não devolveu texto. */
  content: string;
  model: string;
  /** Contagem de tokens, quando a OpenAI informa (útil para medir custo). */
  usage: { promptTokens: number; completionTokens: number } | undefined;
}

export interface OpenAiClient {
  readonly model: string;
  chat(request: ChatRequest): Promise<ChatResult>;
}

export interface OpenAiClientOptions {
  apiKey: string;
  model?: string | undefined;
  baseUrl?: string | undefined;
  timeoutMs?: number;
  /** Injetável nos testes; padrão `globalThis.fetch`. */
  fetchImpl?: typeof fetch;
}

const completionSchema = z
  .object({
    model: z.string().optional(),
    choices: z
      .array(z.object({ message: z.object({ content: z.string().nullable() }).loose() }).loose())
      .min(1),
    usage: z
      .object({
        prompt_tokens: z.number().int().nonnegative().optional(),
        completion_tokens: z.number().int().nonnegative().optional(),
      })
      .loose()
      .optional(),
  })
  .loose();

/** Mensagem de erro da OpenAI, quando vem no formato documentado. */
function messageFromErrorBody(body: unknown): string | undefined {
  const parsed = z.object({ error: z.object({ message: z.string() }).loose() }).safeParse(body);
  return parsed.success ? parsed.data.error.message : undefined;
}

/** Traduz o status da OpenAI para algo que a pessoa na tela consiga agir. */
function explain(status: number, detail: string | undefined): string {
  if (status === 401) return 'A chave da OpenAI foi recusada. Confira OPENAI_API_KEY no servidor.';
  if (status === 429) {
    return 'A OpenAI está limitando as requisições (cota ou volume). Tente de novo em instantes.';
  }
  if (status >= 500) return 'A OpenAI está indisponível no momento. Tente de novo em instantes.';
  return `A OpenAI recusou a requisição (${status})${detail === undefined ? '' : `: ${detail}`}`;
}

export function createOpenAiClient(options: OpenAiClientOptions): OpenAiClient {
  const {
    apiKey,
    model: defaultModel = DEFAULT_OPENAI_MODEL,
    baseUrl = OPENAI_BASE_URL,
    timeoutMs = 90_000,
    fetchImpl = globalThis.fetch,
  } = options;
  const endpoint = `${baseUrl.replace(/\/+$/, '')}${OPENAI_CHAT_PATH}`;

  return {
    model: defaultModel,

    async chat(request) {
      const model = request.model ?? defaultModel;
      let response: Response;
      try {
        response = await fetchImpl(endpoint, {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            authorization: `Bearer ${apiKey}`,
          },
          signal: AbortSignal.timeout(timeoutMs),
          body: JSON.stringify({
            model,
            temperature: request.temperature ?? 0,
            ...(request.maxTokens === undefined ? {} : { max_tokens: request.maxTokens }),
            messages: request.messages,
            ...(request.jsonSchema === undefined
              ? {}
              : {
                  response_format: {
                    type: 'json_schema',
                    json_schema: {
                      name: request.jsonSchema.name,
                      strict: true,
                      schema: request.jsonSchema.schema,
                    },
                  },
                }),
          }),
        });
      } catch (cause) {
        // Timeout ou falha de rede. A causa não é exposta: pode conter a URL com credenciais.
        const timedOut = cause instanceof Error && cause.name === 'TimeoutError';
        throw new OpenAiError(
          timedOut
            ? 'A OpenAI demorou demais para responder. Tente de novo.'
            : 'Não foi possível falar com a OpenAI. Confira a conexão do servidor.',
        );
      }

      if (!response.ok) {
        const detail = messageFromErrorBody(await response.json().catch(() => null));
        throw new OpenAiError(explain(response.status, detail));
      }

      const parsed = completionSchema.safeParse(await response.json().catch(() => null));
      if (!parsed.success) throw new OpenAiError('A OpenAI respondeu num formato inesperado.');

      const usage = parsed.data.usage;
      return {
        content: parsed.data.choices[0]?.message.content ?? '',
        model: parsed.data.model ?? model,
        usage:
          usage === undefined
            ? undefined
            : {
                promptTokens: usage.prompt_tokens ?? 0,
                completionTokens: usage.completion_tokens ?? 0,
              },
      };
    },
  };
}
