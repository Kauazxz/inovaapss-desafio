/**
 * MetricExtractionProvider (§35 + A5): o manual não sugere nada; o de IA ainda não existe e
 * o construtor diz isso em vez de fingir.
 */
import { describe, expect, it } from 'vitest';

import {
  AI_PROVIDER_NAME,
  AiProviderNotConfiguredError,
  createAiMetricExtractionProvider,
  createManualMetricExtractionProvider,
  MANUAL_PROVIDER_NAME,
} from '../../../infrastructure/extraction/index.js';

describe('ManualMetricExtractionProvider', () => {
  it('não gera sugestões automáticas: o humano cria a partir do texto', async () => {
    const provider = createManualMetricExtractionProvider();
    expect(provider.name).toBe(MANUAL_PROVIDER_NAME);
    const drafts = await provider.extract(
      {
        id: 'doc',
        organizationId: 'org',
        fileName: 'politica.md',
        mimeType: 'text/markdown',
        kind: 'markdown',
      },
      { kind: 'markdown', text: 'SLA de 8 horas', meta: { truncated: false } },
    );
    expect(drafts).toEqual([]);
  });
});

describe('provider de IA (reservado — ajuste A5)', () => {
  it('o construtor recusa ser usado nesta fase, sem chamada de rede', () => {
    expect(AI_PROVIDER_NAME).toBe('anthropic');
    expect(() => createAiMetricExtractionProvider({ apiKey: 'nunca-usada' })).toThrow(
      AiProviderNotConfiguredError,
    );
    expect(() => createAiMetricExtractionProvider({ apiKey: 'nunca-usada' })).toThrow(
      /não configurado nesta fase/,
    );
  });
});
