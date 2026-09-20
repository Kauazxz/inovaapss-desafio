/**
 * Descoberta de métricas em documentos com a OpenAI (§35, ajuste A5).
 *
 * Cumpre exatamente o contrato que `anthropic-provider.ts` reservou para a fase de IA:
 *   - a chave fica só no backend (env), nunca em arquivo versionado nem em log;
 *   - a saída é ESTRUTURADA (json_schema) e validada com Zod antes de virar
 *     `MetricSuggestionDraft` — nada do que o modelo devolve entra no banco sem passar por aqui;
 *   - o conteúdo do documento não é registrado em log;
 *   - a sugestão continua `pending` e passa pela revisão humana: o modelo NUNCA ativa métrica,
 *     nem decide peso final. Ele propõe; uma pessoa aprova (§35).
 *
 * Sem SDK de propósito: uma chamada `fetch` com schema explícito é mais fácil de testar (o
 * `fetch` é injetável) e não prende o projeto à versão de um pacote que muda rápido.
 */
import { z } from 'zod';

import { METRIC_DIRECTIONS, METRIC_TYPES, NORMALIZATION_STRATEGIES } from '@inovaapss/shared';

import type {
  ExtractedText,
  ExtractionDocument,
  MetricExtractionProvider,
  MetricSuggestionDraft,
} from './types.js';
import type { OpenAiClient } from '../ai/openai-client.js';

export const OPENAI_PROVIDER_NAME = 'openai';

/** Quanto do documento vai no prompt. Acima disto o texto é cortado (e o modelo é avisado). */
export const DEFAULT_MAX_INPUT_CHARS = 120_000;

/** Quantas sugestões o modelo pode propor por documento. */
const MAX_SUGGESTIONS = 12;

/**
 * O que o modelo pode devolver. É o MESMO vocabulário do motor de métricas: tipo, direção e
 * estratégia de normalização saem das constantes do domínio, então o modelo não pode inventar
 * um valor que o engine não entenda.
 */
const draftSchema = z.object({
  suggestedName: z.string().trim().min(2).max(120),
  description: z.string().trim().max(1000).nullable(),
  suggestedType: z.enum(METRIC_TYPES),
  suggestedDirection: z.enum(METRIC_DIRECTIONS),
  unit: z.string().trim().max(24).nullable(),
  suggestedWeight: z.number().min(0).max(1).nullable(),
  thresholdStrategy: z.enum(NORMALIZATION_STRATEGIES).nullable(),
  thresholdTarget: z.number().nullable(),
  thresholdMin: z.number().nullable(),
  thresholdMax: z.number().nullable(),
  confidence: z.number().min(0).max(1),
  sourceExcerpt: z.string().trim().max(2000).nullable(),
});

const payloadSchema = z.object({ metrics: z.array(draftSchema).max(MAX_SUGGESTIONS) });

/** Schema em JSON Schema puro, do jeito que a API da OpenAI exige em `json_schema`. */
const RESPONSE_JSON_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['metrics'],
  properties: {
    metrics: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: [
          'suggestedName',
          'description',
          'suggestedType',
          'suggestedDirection',
          'unit',
          'suggestedWeight',
          'thresholdStrategy',
          'thresholdTarget',
          'thresholdMin',
          'thresholdMax',
          'confidence',
          'sourceExcerpt',
        ],
        properties: {
          suggestedName: { type: 'string', description: 'Nome curto da métrica, em português.' },
          description: {
            type: ['string', 'null'],
            description: 'O que a métrica mede e por que importa para a saúde do cliente.',
          },
          suggestedType: { type: 'string', enum: [...METRIC_TYPES] },
          suggestedDirection: { type: 'string', enum: [...METRIC_DIRECTIONS] },
          unit: { type: ['string', 'null'], description: 'Unidade (h, %, R$, chamados...).' },
          suggestedWeight: {
            type: ['number', 'null'],
            description: 'Peso sugerido como fração de 0 a 1, ou null quando o documento não diz.',
          },
          thresholdStrategy: {
            type: ['string', 'null'],
            enum: [...NORMALIZATION_STRATEGIES, null],
          },
          thresholdTarget: {
            type: ['number', 'null'],
            description: 'Meta citada no documento (ex.: 8 horas de SLA).',
          },
          thresholdMin: { type: ['number', 'null'] },
          thresholdMax: { type: ['number', 'null'] },
          confidence: {
            type: 'number',
            description: '0 a 1: quanto o documento sustenta esta métrica.',
          },
          sourceExcerpt: {
            type: ['string', 'null'],
            description: 'Trecho LITERAL do documento que justifica a sugestão.',
          },
        },
      },
    },
  },
} as const;

const SYSTEM_PROMPT = `Você lê documentos de empresas de tecnologia (contratos, políticas de SLA, manuais de KPI, relatórios de atendimento) e propõe MÉTRICAS de saúde de cliente para um motor configurável.

Regras, em ordem de importância:
1. Só proponha métrica que o documento sustente. Se o documento não fala de números, devolva a lista vazia. Inventar métrica é o pior erro possível aqui.
2. Todo item precisa de "sourceExcerpt": um trecho LITERAL do documento, copiado sem alterar. Se você não consegue copiar um trecho, não proponha a métrica.
3. "confidence" é honesto: 0,9+ quando o documento define a métrica e a meta explicitamente; 0,5 quando você está inferindo de um texto solto; abaixo disso não proponha.
4. Prefira poucas métricas boas a muitas fracas. No máximo 12.
5. "suggestedDirection": HIGHER_IS_WORSE para o que piora ao subir (tempo de resolução, chamados críticos, atraso de pagamento, reclamações); HIGHER_IS_BETTER para o que melhora ao subir (uso da plataforma, cumprimento de SLA, NPS); TARGET_RANGE quando existe uma faixa ideal.
6. Quando o documento cita uma meta numérica (ex.: "resolver em até 8 horas"), preencha thresholdTarget com o número e thresholdStrategy com a estratégia que faça sentido.
7. "suggestedWeight" só quando o documento indicar importância relativa. Na dúvida, null: quem define peso é a pessoa que revisa.
8. Nomes e descrições em português do Brasil.`;

export interface OpenAiMetricExtractionOptions {
  /** Cliente compartilhado com o Agente IA (infrastructure/ai/openai-client.ts). */
  client: OpenAiClient;
  maxInputChars?: number;
  /** Sugestões abaixo desta confiança são descartadas antes de chegar ao banco. */
  minConfidence?: number;
}

/** Converte a saída validada no formato que o módulo de documentos grava. */
function toDraft(item: z.infer<typeof draftSchema>): MetricSuggestionDraft {
  const thresholds: Record<string, unknown> = {};
  if (item.thresholdStrategy !== null) thresholds['strategy'] = item.thresholdStrategy;
  if (item.thresholdTarget !== null) thresholds['target'] = item.thresholdTarget;
  if (item.thresholdMin !== null) thresholds['min'] = item.thresholdMin;
  if (item.thresholdMax !== null) thresholds['max'] = item.thresholdMax;

  return {
    suggestedName: item.suggestedName,
    ...(item.description === null ? {} : { description: item.description }),
    suggestedType: item.suggestedType,
    suggestedDirection: item.suggestedDirection,
    ...(item.unit === null ? {} : { unit: item.unit }),
    ...(item.suggestedWeight === null ? {} : { suggestedWeight: item.suggestedWeight }),
    ...(Object.keys(thresholds).length === 0
      ? {}
      : { suggestedThresholds: thresholds as MetricSuggestionDraft['suggestedThresholds'] }),
    confidence: item.confidence,
    ...(item.sourceExcerpt === null ? {} : { sourceExcerpt: item.sourceExcerpt }),
  };
}

export function createOpenAiMetricExtractionProvider(
  options: OpenAiMetricExtractionOptions,
): MetricExtractionProvider {
  const { client, maxInputChars = DEFAULT_MAX_INPUT_CHARS, minConfidence = 0.5 } = options;

  return {
    name: OPENAI_PROVIDER_NAME,

    async extract(
      document: ExtractionDocument,
      text: ExtractedText,
    ): Promise<MetricSuggestionDraft[]> {
      const body = text.text.slice(0, maxInputChars);
      if (body.trim() === '') return [];
      const cut = text.text.length > maxInputChars || text.meta.truncated;

      const result = await client.chat({
        // Determinismo importa: o mesmo documento deve render a mesma leitura.
        temperature: 0,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          {
            role: 'user',
            content: [
              `Documento: ${document.fileName} (tipo ${document.kind}).`,
              cut ? 'Atenção: o texto abaixo está cortado; não conclua nada sobre o fim.' : '',
              '',
              '--- início do documento ---',
              body,
              '--- fim do documento ---',
            ]
              .filter((line) => line !== '')
              .join('\n'),
          },
        ],
        jsonSchema: { name: 'metric_suggestions', schema: RESPONSE_JSON_SCHEMA },
      });

      if (result.content.trim() === '') return [];

      let parsedJson: unknown;
      try {
        parsedJson = JSON.parse(result.content);
      } catch {
        // JSON quebrado é falha do modelo, não do documento: nenhuma sugestão em vez de erro.
        return [];
      }

      const payload = payloadSchema.safeParse(parsedJson);
      // Saída fora do schema é descartada inteira: melhor nenhuma sugestão do que uma inventada.
      if (!payload.success) return [];

      return payload.data.metrics.filter((item) => item.confidence >= minConfidence).map(toDraft);
    },
  };
}
