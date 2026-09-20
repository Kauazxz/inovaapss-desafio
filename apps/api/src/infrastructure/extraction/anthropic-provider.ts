/**
 * Provider de IA para sugestão de métricas — RESERVADO (ajuste A5: fica para depois, P2).
 *
 * Este arquivo define apenas o contrato que a implementação futura vai cumprir e um construtor
 * que recusa ser usado. Sem SDK, sem chamada de rede, sem chave. Quando a fase de IA chegar:
 *   - a chave fica só no backend (env), nunca em arquivo versionado nem em log;
 *   - a saída é estruturada e validada com Zod antes de virar MetricSuggestionDraft;
 *   - o conteúdo dos documentos não é logado;
 *   - a sugestão continua passando pela revisão humana (§35: nada é ativado sozinho).
 */
import type { MetricExtractionProvider } from './types.js';

export const AI_PROVIDER_NAME = 'anthropic';

/** Configuração esperada pela implementação futura (nomes fixados agora para o env e a doc). */
export interface AiMetricExtractionProviderOptions {
  /** Chave da API, vinda do ambiente do backend. */
  apiKey: string;
  /** Modelo a usar; a implementação futura define o padrão. */
  model?: string;
  /** Máximo de caracteres do texto extraído enviados por documento. */
  maxInputChars?: number;
  /** Confiança mínima (0–1) para uma sugestão ser gravada. */
  minConfidence?: number;
}

export class AiProviderNotConfiguredError extends Error {
  constructor() {
    super('Provider de IA não configurado nesta fase (ajuste A5). Use o fluxo manual.');
    this.name = 'AiProviderNotConfiguredError';
  }
}

/**
 * Ponto de extensão: a implementação futura devolve um MetricExtractionProvider com
 * `name = AI_PROVIDER_NAME`. Hoje lança AiProviderNotConfiguredError sempre.
 */
export function createAiMetricExtractionProvider(
  _options: AiMetricExtractionProviderOptions,
): MetricExtractionProvider {
  throw new AiProviderNotConfiguredError();
}
