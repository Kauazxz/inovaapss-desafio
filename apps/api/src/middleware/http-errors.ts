/**
 * Erros HTTP usados pelos middlewares de auth, tenant e RBAC. Todos são AppError, então o
 * error-handler os converte no JSON padrão `{ error: { code, message, requestId } }`.
 */
import { AppError } from '../shared/errors.js';

export class UnauthorizedError extends AppError {
  constructor(message = 'Faça login para continuar.') {
    super(401, 'UNAUTHORIZED', message);
    this.name = 'UnauthorizedError';
  }
}

export class ForbiddenError extends AppError {
  constructor(message = 'Você não tem permissão para esta ação.', code = 'FORBIDDEN') {
    super(403, code, message);
    this.name = 'ForbiddenError';
  }
}

export class NoOrganizationError extends ForbiddenError {
  constructor() {
    super('Seu usuário ainda não pertence a uma organização.', 'NO_ORGANIZATION');
    this.name = 'NoOrganizationError';
  }
}

export class ConflictError extends AppError {
  constructor(message: string, code = 'CONFLICT') {
    super(409, code, message);
    this.name = 'ConflictError';
  }
}
