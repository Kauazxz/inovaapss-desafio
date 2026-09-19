/**
 * Erro de configuração do motor: a organização configurou uma métrica, um gatilho ou uma
 * política de forma que o motor não consegue avaliar. Nunca é erro de dado — dado ausente
 * vira N/A (null), não exceção.
 */
export class EngineConfigError extends Error {
  override readonly name: string = 'EngineConfigError';

  constructor(message: string) {
    super(message);
  }
}

/** Erro de regra segura recusada (JSON Logic com operador ou caminho proibido). */
export class UnsafeRuleError extends EngineConfigError {
  override readonly name: string = 'UnsafeRuleError';
}
