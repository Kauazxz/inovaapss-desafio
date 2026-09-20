/**
 * Analisador local de documentos. Ele mantém a descoberta automática funcional mesmo quando a
 * organização ainda não configurou uma chave de IA e também serve como fallback previsível para
 * planilhas. Só sugere métricas quando encontra um sinal conhecido; colunas de identificação e
 * dimensões nunca viram métricas por adivinhação.
 */
import type { MetricDirection, MetricType } from '@inovaapss/shared';

import type {
  ExtractedText,
  ExtractionDocument,
  MetricExtractionProvider,
  MetricSuggestionDraft,
} from './types.js';

export const HEURISTIC_PROVIDER_NAME = 'automatic-local';

interface MetricHint {
  type: MetricType;
  direction: MetricDirection;
  unit?: string;
  confidence: number;
}

const IGNORED_COLUMNS = [
  /(^|_)(id|uuid|codigo|code|chave|key)($|_)/,
  /(^|_)(cliente|customer|conta|account)_(id|nome|name)($|_)/,
  /(^|_)(nome|name|descricao|description|segmento|segment|porte|plano|plan)($|_)/,
  /(^|_)(data|date|mes|month|periodo|period|referencia|ref)($|_)/,
  /(^|_)(status|categoria|category|tipo|type)($|_)/,
];

const HINTS: readonly { pattern: RegExp; hint: MetricHint }[] = [
  {
    pattern: /(nps|csat|health|score|satisfacao)/,
    hint: { type: 'SCORE', direction: 'HIGHER_IS_BETTER', confidence: 0.8 },
  },
  {
    pattern: /(tempo|time|duracao|duration|latencia|latency|tma|tmr|horas?|minutes?|minutos?)/,
    hint: { type: 'TIME', direction: 'HIGHER_IS_WORSE', unit: 'h', confidence: 0.76 },
  },
  {
    pattern: /(mrr|receita|revenue|faturamento|valor|ticket_medio)/,
    hint: { type: 'FINANCIAL', direction: 'HIGHER_IS_BETTER', unit: 'R$', confidence: 0.74 },
  },
  {
    pattern: /(custo|cost|divida|debito|inadimplencia_valor)/,
    hint: { type: 'FINANCIAL', direction: 'HIGHER_IS_WORSE', unit: 'R$', confidence: 0.72 },
  },
  {
    pattern: /(churn|cancelamento|inadimplencia|reabertura|erro|falha|atraso|violacao|breach)/,
    hint: { type: 'PERCENTAGE', direction: 'HIGHER_IS_WORSE', unit: '%', confidence: 0.73 },
  },
  {
    pattern: /(sla|cumprimento|adocao|adoption|engajamento|conversao|retencao|disponibilidade)/,
    hint: { type: 'PERCENTAGE', direction: 'HIGHER_IS_BETTER', unit: '%', confidence: 0.76 },
  },
  {
    pattern: /(pct|percent|percentual|taxa|rate)/,
    hint: { type: 'PERCENTAGE', direction: 'HIGHER_IS_BETTER', unit: '%', confidence: 0.62 },
  },
  {
    pattern: /(chamados?_abertos?|tickets?_abertos?|incidentes?|erros?|reclamacoes?)/,
    hint: { type: 'QUANTITY', direction: 'HIGHER_IS_WORSE', confidence: 0.71 },
  },
  {
    pattern: /(usuarios?_ativos?|acessos?|logins?|sessoes?|reunioes?|interacoes?)/,
    hint: { type: 'FREQUENCY', direction: 'HIGHER_IS_BETTER', confidence: 0.68 },
  },
  {
    pattern: /(quantidade|qtd|total|count)/,
    hint: { type: 'QUANTITY', direction: 'HIGHER_IS_BETTER', confidence: 0.55 },
  },
];

function normalized(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

function title(value: string): string {
  const words = normalized(value).split('_').filter(Boolean);
  const label = words.join(' ');
  return label === '' ? value.trim() : `${label.charAt(0).toUpperCase()}${label.slice(1)}`;
}

function isIgnoredColumn(column: string): boolean {
  return IGNORED_COLUMNS.some((pattern) => pattern.test(column));
}

function hintForColumn(column: string): MetricHint | null {
  if (isIgnoredColumn(column)) return null;
  return HINTS.find(({ pattern }) => pattern.test(column))?.hint ?? null;
}

function headerColumns(text: string): string[] {
  const columns: string[] = [];
  for (const match of text.matchAll(/^Colunas \(\d+\):\s*(.+)$/gim)) {
    const line = match[1];
    if (line === undefined) continue;
    columns.push(
      ...line
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean),
    );
  }
  return [...new Set(columns)];
}

function fromColumns(text: string): MetricSuggestionDraft[] {
  return headerColumns(text).flatMap((column) => {
    const key = normalized(column);
    const hint = hintForColumn(key);
    if (hint === null) return [];
    return [
      {
        suggestedName: title(column),
        description: `Métrica identificada na coluna “${column}” do arquivo tabular.`,
        suggestedType: hint.type,
        suggestedDirection: hint.direction,
        ...(hint.unit ? { unit: hint.unit } : {}),
        confidence: hint.confidence,
        sourceExcerpt: `Coluna identificada: ${column}`,
      },
    ];
  });
}

function contextualExcerpt(text: string, start: number, length: number): string {
  const from = Math.max(0, start - 90);
  const to = Math.min(text.length, start + length + 90);
  return text.slice(from, to).replace(/\s+/g, ' ').trim();
}

function fromProse(text: string): MetricSuggestionDraft[] {
  const suggestions: MetricSuggestionDraft[] = [];
  const resolution =
    /(resolu[cç][aã]o|atendimento|resposta)[^\n.]{0,60}?(?:at[eé]\s*)?\*{0,2}(\d+(?:[.,]\d+)?)\s*(horas?|h|minutos?|min)\b/giu;
  for (const match of text.matchAll(resolution)) {
    const raw = Number((match[2] ?? '').replace(',', '.'));
    const rawUnit = normalized(match[3] ?? 'h');
    if (!Number.isFinite(raw) || raw <= 0) continue;
    const hours = rawUnit.startsWith('min') ? raw / 60 : raw;
    suggestions.push({
      suggestedName: `Tempo de ${normalized(match[1] ?? 'resolucao').replaceAll('_', ' ')}`,
      description: 'Prazo operacional identificado no documento.',
      suggestedType: 'TIME',
      suggestedDirection: 'HIGHER_IS_WORSE',
      unit: 'h',
      confidence: 0.88,
      suggestedThresholds: {
        strategy: 'THRESHOLD_BANDS',
        bands: [
          { upTo: hours, health: 100 },
          { upTo: Number((hours * 1.5).toFixed(2)), health: 50 },
          { upTo: null, health: 0 },
        ],
      },
      sourceExcerpt: contextualExcerpt(text, match.index ?? 0, match[0].length),
    });
  }

  const percentage =
    /([^\n.]{3,80}?)(?:acima de|maior que|superior a|abaixo de|menor que|inferior a|meta de)\s*(\d+(?:[.,]\d+)?)\s*%/giu;
  for (const match of text.matchAll(percentage)) {
    const label = (match[1] ?? '').replace(/^[-*#\s]+/, '').trim();
    const threshold = Number((match[2] ?? '').replace(',', '.'));
    if (!Number.isFinite(threshold) || threshold < 0 || threshold > 100) continue;
    const worse = /reabertura|churn|cancelamento|inadimpl|erro|falha|atraso/i.test(label);
    suggestions.push({
      suggestedName: title(label.slice(-70)),
      description: 'Percentual com limite explícito identificado no documento.',
      suggestedType: 'PERCENTAGE',
      suggestedDirection: worse ? 'HIGHER_IS_WORSE' : 'HIGHER_IS_BETTER',
      unit: '%',
      confidence: 0.82,
      suggestedThresholds: {
        strategy: 'THRESHOLD_BANDS',
        bands: worse
          ? [
              { upTo: threshold, health: 100 },
              { upTo: null, health: 0 },
            ]
          : [
              { upTo: threshold, health: 0 },
              { upTo: null, health: 100 },
            ],
      },
      sourceExcerpt: contextualExcerpt(text, match.index ?? 0, match[0].length),
    });
  }

  if (/reuni[aã]o mensal/iu.test(text)) {
    const index = text.search(/reuni[aã]o mensal/iu);
    suggestions.push({
      suggestedName: 'Reuniões de acompanhamento realizadas',
      description: 'Frequência de reuniões mensais prevista no documento.',
      suggestedType: 'FREQUENCY',
      suggestedDirection: 'HIGHER_IS_BETTER',
      unit: 'por mês',
      confidence: 0.8,
      suggestedThresholds: { strategy: 'RATIO_TO_TARGET', target: 1 },
      sourceExcerpt: contextualExcerpt(text, index, 15),
    });
  }
  return suggestions;
}

function uniqueSuggestions(drafts: readonly MetricSuggestionDraft[]): MetricSuggestionDraft[] {
  const seen = new Set<string>();
  return drafts.filter((draft) => {
    const key = normalized(draft.suggestedName);
    if (key === '' || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function createHeuristicMetricExtractionProvider(): MetricExtractionProvider {
  return {
    name: HEURISTIC_PROVIDER_NAME,
    async extract(_document: ExtractionDocument, extracted: ExtractedText) {
      return uniqueSuggestions([
        ...(extracted.kind === 'csv' || extracted.kind === 'xlsx'
          ? fromColumns(extracted.text)
          : []),
        ...fromProse(extracted.text),
      ]).slice(0, 8);
    },
  };
}
