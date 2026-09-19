/**
 * Cliente HTTP da API Express (apps/api).
 *
 * Erros da API chegam no formato `{ error: { code, message, requestId } }` e viram `ApiError`,
 * para as telas mostrarem a mensagem e o requestId (que o suporte procura no log).
 *
 * Autenticação: o AuthProvider registra, via `configureApiAuth`, de onde vem o access_token da
 * sessão e o que fazer num 401 (encerrar a sessão e voltar para /login). Assim este módulo não
 * depende do Supabase e continua testável sem `.env`.
 */
import { clientEnvSchema } from '@inovaapss/validation';

/** Endereço da API. Vem de VITE_API_URL (.env da raiz); padrão http://localhost:3001. */
export const API_URL: string = clientEnvSchema.shape.VITE_API_URL.parse(
  import.meta.env.VITE_API_URL,
);

export interface ApiErrorBody {
  error: {
    code: string;
    message: string;
    requestId?: string;
  };
}

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly requestId: string | undefined;

  constructor(status: number, body: ApiErrorBody['error']) {
    super(body.message);
    this.name = 'ApiError';
    this.status = status;
    this.code = body.code;
    this.requestId = body.requestId;
  }
}

function isApiErrorBody(value: unknown): value is ApiErrorBody {
  if (typeof value !== 'object' || value === null || !('error' in value)) return false;
  const error = (value as { error: unknown }).error;
  return (
    typeof error === 'object' &&
    error !== null &&
    typeof (error as { code?: unknown }).code === 'string' &&
    typeof (error as { message?: unknown }).message === 'string'
  );
}

export interface ApiAuthHooks {
  /** access_token da sessão atual, ou null quando não há sessão. */
  getToken(): Promise<string | null>;
  /** Chamado quando a API responde 401 com o token da sessão (sessão inválida/expirada). */
  onUnauthorized?: () => void;
}

let authHooks: ApiAuthHooks | null = null;

/** Liga (ou desliga, com null) a sessão ao cliente HTTP. Chamado pelo AuthProvider. */
export function configureApiAuth(hooks: ApiAuthHooks | null): void {
  authHooks = hooks;
}

export interface ApiRequestOptions extends Omit<RequestInit, 'body'> {
  /** Corpo serializado como JSON (define Content-Type sozinho). */
  json?: unknown;
  /** Token explícito (Authorization: Bearer). Sem ele, usa o da sessão via configureApiAuth. */
  token?: string;
}

/**
 * `apiFetch<T>('/api/v1/clients')` → faz a requisição, valida o status e devolve o JSON tipado.
 * Lança `ApiError` para respostas de erro no formato da API e `Error` para falhas de rede.
 */
export async function apiFetch<T>(path: string, options: ApiRequestOptions = {}): Promise<T> {
  const { json, token, headers, ...init } = options;
  const finalHeaders = new Headers(headers);
  finalHeaders.set('Accept', 'application/json');
  if (json !== undefined) finalHeaders.set('Content-Type', 'application/json');

  const usingSessionToken = token === undefined && authHooks !== null;
  const bearer = token ?? (authHooks ? await authHooks.getToken() : null);
  if (bearer) finalHeaders.set('Authorization', `Bearer ${bearer}`);

  let response: Response;
  try {
    response = await fetch(`${API_URL}${path}`, {
      ...init,
      headers: finalHeaders,
      body: json === undefined ? null : JSON.stringify(json),
    });
  } catch (cause) {
    throw new Error(
      'Não foi possível falar com a API. Confira sua conexão e se a API está no ar.',
      {
        cause,
      },
    );
  }

  if (response.status === 204) return undefined as T;

  const text = await response.text();
  let payload: unknown = null;
  if (text !== '') {
    try {
      payload = JSON.parse(text);
    } catch {
      payload = null;
    }
  }

  if (!response.ok) {
    if (response.status === 401 && usingSessionToken && bearer) {
      authHooks?.onUnauthorized?.();
    }
    if (isApiErrorBody(payload)) throw new ApiError(response.status, payload.error);
    throw new ApiError(response.status, {
      code: 'HTTP_ERROR',
      message: `A API respondeu ${response.status} sem detalhar o erro.`,
    });
  }

  return payload as T;
}
