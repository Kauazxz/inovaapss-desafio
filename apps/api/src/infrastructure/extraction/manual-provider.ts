/**
 * ManualMetricExtractionProvider (§35, ajuste A5): o fluxo manual. Não gera sugestão nenhuma —
 * o texto extraído fica disponível na tela e uma pessoa cria as sugestões (POST
 * /documents/:id/suggestions). Existe para o módulo já falar com a interface que o provider de
 * IA vai implementar depois.
 */
import type { MetricExtractionProvider } from './types.js';

export const MANUAL_PROVIDER_NAME = 'manual';

export function createManualMetricExtractionProvider(): MetricExtractionProvider {
  return {
    name: MANUAL_PROVIDER_NAME,
    async extract() {
      return [];
    },
  };
}
