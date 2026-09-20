/**
 * Providers automáticos (§35): análise local sem chave e Claude com saída estruturada.
 */
import { describe, expect, it } from 'vitest';

import {
  AI_PROVIDER_NAME,
  AiProviderNotConfiguredError,
  createAiMetricExtractionProvider,
  createHeuristicMetricExtractionProvider,
  createManualMetricExtractionProvider,
  HEURISTIC_PROVIDER_NAME,
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

describe('analisador automático local', () => {
  it('descobre métricas e limites em uma política de SLA', async () => {
    const provider = createHeuristicMetricExtractionProvider();
    expect(provider.name).toBe(HEURISTIC_PROVIDER_NAME);
    const drafts = await provider.extract(
      {
        id: 'doc',
        organizationId: 'org',
        fileName: 'politica.md',
        mimeType: 'text/markdown',
        kind: 'markdown',
      },
      {
        kind: 'markdown',
        text: 'Resolução em até 8 horas. Reabertura acima de 10% exige plano. Reunião mensal.',
        meta: { truncated: false },
      },
    );
    expect(drafts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ suggestedType: 'TIME', unit: 'h', confidence: 0.88 }),
        expect.objectContaining({ suggestedType: 'PERCENTAGE', unit: '%' }),
        expect.objectContaining({ suggestedType: 'FREQUENCY', unit: 'por mês' }),
      ]),
    );
  });

  it('ignora identificadores e sugere apenas colunas reconhecidas da planilha', async () => {
    const provider = createHeuristicMetricExtractionProvider();
    const drafts = await provider.extract(
      {
        id: 'doc',
        organizationId: 'org',
        fileName: 'clientes.csv',
        mimeType: 'text/csv',
        kind: 'csv',
      },
      {
        kind: 'csv',
        text: 'Colunas (4): cliente_id, mes_ref, chamados_abertos, pct_sla_cumprido',
        meta: { rows: 2, truncated: false },
      },
    );
    expect(drafts.map((draft) => draft.suggestedName)).toEqual([
      'Chamados abertos',
      'Pct sla cumprido',
    ]);
  });
});

describe('provider Claude', () => {
  it('exige uma chave não vazia', () => {
    expect(AI_PROVIDER_NAME).toBe('anthropic');
    expect(() => createAiMetricExtractionProvider({ apiKey: '  ' })).toThrow(
      AiProviderNotConfiguredError,
    );
  });

  it('envia o texto no backend e lê as sugestões da chamada estruturada', async () => {
    let request: RequestInit | undefined;
    const provider = createAiMetricExtractionProvider({
      apiKey: 'segredo-de-teste',
      minConfidence: 0.6,
      fetchImpl: async (_input, init) => {
        request = init;
        return new Response(
          JSON.stringify({
            content: [
              {
                type: 'tool_use',
                name: 'submit_metric_suggestions',
                input: {
                  suggestions: [
                    {
                      suggestedName: 'Cumprimento de SLA',
                      suggestedType: 'PERCENTAGE',
                      suggestedDirection: 'HIGHER_IS_BETTER',
                      unit: '%',
                      confidence: 0.91,
                      sourceExcerpt: 'SLA mínimo de 95%',
                    },
                    {
                      suggestedName: 'Palpite fraco',
                      suggestedType: 'SCORE',
                      suggestedDirection: 'HIGHER_IS_BETTER',
                      confidence: 0.2,
                      sourceExcerpt: 'sem evidência suficiente',
                    },
                  ],
                },
              },
            ],
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        );
      },
    });
    const drafts = await provider.extract(
      {
        id: 'doc',
        organizationId: 'org',
        fileName: 'sla.txt',
        mimeType: 'text/plain',
        kind: 'text',
      },
      { kind: 'text', text: 'SLA mínimo de 95%', meta: { truncated: false } },
    );

    expect(drafts).toHaveLength(1);
    expect(drafts[0]).toMatchObject({ suggestedName: 'Cumprimento de SLA', confidence: 0.91 });
    expect(request?.headers).toMatchObject({ 'x-api-key': 'segredo-de-teste' });
    expect(String(request?.body)).toContain('submit_metric_suggestions');
  });
});
