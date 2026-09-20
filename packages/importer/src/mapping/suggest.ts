/**
 * Detecção de colunas (§34 "detecção → mapeamento"): para cada campo do dataset, escolhe o
 * cabeçalho do arquivo mais parecido, com confiança 0–1, sem usar um cabeçalho duas vezes.
 *
 *   1,00  nome idêntico à chave do campo            (`external_code`)
 *   0,95  sinônimo exato                            (`cliente_id`)
 *   ≤0,85 um contém o outro                         (`valor_mensal_r` ⊃ `valor_mensal`)
 *   ≤0,80 tokens em comum (Jaccard)                 (`sla_cumprido_no_mes` ~ `pct_sla_cumprido`)
 *
 * Abaixo de `minConfidence` (0,5) o campo fica sem coluna.
 */
import { DATASETS } from '../datasets/catalog.js';
import { headerTokens, normalizeHeader } from '../shared/headers.js';
import {
  type DatasetDetection,
  type DatasetKey,
  type DatasetSpec,
  type FieldMappingSuggestion,
  type FieldSpec,
  type Mapping,
  type MappingSuggestion,
  type SuggestMappingOptions,
} from '../types.js';

const DEFAULT_MIN_CONFIDENCE = 0.5;

/** Confiança considerada alta na interface (mapeamento aceito sem revisão). */
export const HIGH_CONFIDENCE = 0.9;

interface Candidate {
  fieldIndex: number;
  headerIndex: number;
  confidence: number;
  reason: FieldMappingSuggestion['reason'];
}

function containment(a: string, b: string): number {
  if (a.length === 0 || b.length === 0) return 0;
  const [shorter, longer] = a.length <= b.length ? [a, b] : [b, a];
  if (!longer.includes(shorter)) return 0;
  // Só conta quando o menor é um pedaço "de palavra" do maior (evita `id` dentro de `validade`).
  const escaped = shorter.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  if (!new RegExp(`(^|_)${escaped}(_|$)`).test(longer)) return 0;
  return 0.5 + 0.35 * (shorter.length / longer.length);
}

function jaccard(a: readonly string[], b: readonly string[]): number {
  if (a.length === 0 || b.length === 0) return 0;
  const setA = new Set(a);
  const setB = new Set(b);
  let common = 0;
  for (const token of setA) if (setB.has(token)) common += 1;
  return common / (setA.size + setB.size - common);
}

/** Confiança de um cabeçalho normalizado representar um campo. */
export function scoreHeaderForField(
  normalizedHeader: string,
  field: FieldSpec,
): { confidence: number; reason: FieldMappingSuggestion['reason'] } {
  if (normalizedHeader.length === 0) return { confidence: 0, reason: 'none' };
  if (normalizedHeader === field.key) return { confidence: 1, reason: 'exact' };
  if (field.synonyms.includes(normalizedHeader)) return { confidence: 0.95, reason: 'synonym' };

  const names = [field.key, ...field.synonyms];
  let best = 0;
  let reason: FieldMappingSuggestion['reason'] = 'none';
  for (const name of names) {
    const contained = containment(normalizedHeader, name);
    if (contained > best) {
      best = contained;
      reason = 'partial';
    }
  }
  const headerTokenList = headerTokens(normalizedHeader);
  for (const name of names) {
    const similarity = jaccard(headerTokenList, headerTokens(name));
    if (similarity < 0.34) continue;
    const score = 0.3 + 0.5 * similarity;
    if (score > best) {
      best = score;
      reason = 'tokens';
    }
  }
  return { confidence: Math.round(best * 100) / 100, reason };
}

/** Sugere o mapeamento campo → cabeçalho para um dataset. `headers` são os cabeçalhos ORIGINAIS. */
export function suggestMapping(
  headers: readonly string[],
  dataset: DatasetSpec | DatasetKey,
  options: SuggestMappingOptions = {},
): MappingSuggestion {
  const spec = typeof dataset === 'string' ? DATASETS[dataset] : dataset;
  const minConfidence = options.minConfidence ?? DEFAULT_MIN_CONFIDENCE;
  const normalized = headers.map(normalizeHeader);

  const candidates: Candidate[] = [];
  spec.fields.forEach((field, fieldIndex) => {
    normalized.forEach((header, headerIndex) => {
      const { confidence, reason } = scoreHeaderForField(header, field);
      if (confidence >= minConfidence)
        candidates.push({ fieldIndex, headerIndex, confidence, reason });
    });
  });
  // Maior confiança primeiro; empate resolvido pela ordem do catálogo e depois do arquivo (determinístico).
  candidates.sort(
    (a, b) =>
      b.confidence - a.confidence || a.fieldIndex - b.fieldIndex || a.headerIndex - b.headerIndex,
  );

  const chosen = new Map<number, Candidate>();
  const usedHeaders = new Set<number>();
  for (const candidate of candidates) {
    if (chosen.has(candidate.fieldIndex) || usedHeaders.has(candidate.headerIndex)) continue;
    chosen.set(candidate.fieldIndex, candidate);
    usedHeaders.add(candidate.headerIndex);
  }

  const mapping: Mapping = {};
  const fields: FieldMappingSuggestion[] = spec.fields.map((field, fieldIndex) => {
    const candidate = chosen.get(fieldIndex);
    const header = candidate ? (headers[candidate.headerIndex] ?? null) : null;
    mapping[field.key] = header;
    return {
      field: field.key,
      label: field.label,
      required: field.required,
      header,
      confidence: candidate?.confidence ?? 0,
      reason: candidate?.reason ?? 'none',
    };
  });

  const missingRequired = fields.filter((f) => f.required && f.header === null).map((f) => f.field);
  const requiredFields = fields.filter((f) => f.required);
  const confidence =
    missingRequired.length > 0 || requiredFields.length === 0
      ? 0
      : Math.round(
          (requiredFields.reduce((sum, f) => sum + f.confidence, 0) / requiredFields.length) * 100,
        ) / 100;

  return {
    dataset: spec.key,
    mapping,
    fields,
    unmappedHeaders: headers.filter((_, index) => !usedHeaders.has(index)),
    missingRequired,
    confidence,
  };
}

/**
 * "Que tabela é esta?" — ranking dos datasets pela confiança do mapeamento sugerido. Desempate
 * pela fração de cabeçalhos aproveitados, para `nps` e `monthly_metrics` (mesma chave natural)
 * não se confundirem.
 */
export function detectDataset(
  headers: readonly string[],
  options: SuggestMappingOptions = {},
): DatasetDetection[] {
  const detections = (Object.keys(DATASETS) as DatasetKey[]).map((key) => {
    const suggestion = suggestMapping(headers, key, options);
    const mappedCount = suggestion.fields.filter((f) => f.header !== null).length;
    const coverage = headers.length === 0 ? 0 : mappedCount / headers.length;
    const fieldCoverage = mappedCount / Math.max(suggestion.fields.length, 1);
    const confidence =
      Math.round(suggestion.confidence * (0.6 + 0.2 * coverage + 0.2 * fieldCoverage) * 100) / 100;
    return { dataset: key, confidence, suggestion };
  });
  return detections.sort((a, b) => b.confidence - a.confidence);
}
