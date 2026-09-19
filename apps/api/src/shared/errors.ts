/**
 * Erros de aplicação. O error-handler converte qualquer AppError na resposta
 * `{ error: { code, message, requestId } }` com o status HTTP indicado.
 * Erros que não são AppError viram 500 sem expor detalhes em produção.
 */
export class AppError extends Error {
  readonly statusCode: number;
  readonly code: string;
  readonly details: unknown;

  constructor(statusCode: number, code: string, message: string, details?: unknown) {
    super(message);
    this.name = 'AppError';
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
  }
}

export class NotFoundError extends AppError {
  constructor(message = 'Recurso não encontrado.') {
    super(404, 'NOT_FOUND', message);
    this.name = 'NotFoundError';
  }
}

export class DatabaseNotConfiguredError extends AppError {
  constructor() {
    super(
      503,
      'DATABASE_NOT_CONFIGURED',
      'DATABASE_URL não está configurada. Defina no .env da raiz (modelo em .env.example).',
    );
    this.name = 'DatabaseNotConfiguredError';
  }
}
