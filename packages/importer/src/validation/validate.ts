/**
 * Validação por dataset (§34): Zod por linha + duplicidade pela chave natural + relatório
 * `ImportReport` { total, valid, invalid, duplicates, missingFields, errors }.
 *
 * Contagem: `total = valid + invalid + duplicates`. Uma linha com qualquer erro (coerção ou
 * schema) é inválida e sai do resultado; entre as válidas, a repetição da chave natural fica de
 * fora com erro `DUPLICATE` (a primeira ocorrência vence).
 */
import { type z } from 'zod';

import { DATASETS } from '../datasets/catalog.js';
import { DATASET_SCHEMAS, type DatasetRowTypes } from '../datasets/schemas.js';
import { applyMapping } from '../mapping/apply.js';
import { suggestMapping } from '../mapping/suggest.js';
import {
  type DatasetImportResult,
  type DatasetKey,
  type ImportErrorCode,
  type ImportReport,
  type ImportRowError,
  type MappedRow,
  type Mapping,
  type RawRow,
} from '../types.js';

const CODE_BY_ISSUE: Readonly<Record<string, ImportErrorCode>> = {
  too_small: 'OUT_OF_RANGE',
  too_big: 'OUT_OF_RANGE',
  invalid_format: 'INVALID_VALUE',
  invalid_value: 'INVALID_ENUM',
  invalid_type: 'INVALID_VALUE',
};

function issueToError(issue: z.core.$ZodIssue, row: MappedRow): ImportRowError {
  const field = typeof issue.path[0] === 'string' ? issue.path[0] : null;
  const value = field === null ? undefined : row.values[field];
  let code: ImportErrorCode;
  if (issue.code === 'custom') {
    const custom = issue.params?.['code'];
    code = typeof custom === 'string' ? (custom as ImportErrorCode) : 'INVALID_VALUE';
  } else if (issue.code === 'invalid_type' && (value === null || value === undefined)) {
    code = 'MISSING_REQUIRED';
  } else {
    code = CODE_BY_ISSUE[issue.code] ?? 'INVALID_VALUE';
  }
  return { row: row.row, field, code, message: issue.message };
}

function naturalKeyOf(values: Record<string, unknown>, keys: readonly string[]): string {
  return keys.map((key) => String(values[key] ?? '')).join('\u0000');
}

export interface ValidateDatasetInput {
  rows: readonly MappedRow[];
  /** Erros de coerção vindos de `applyMapping` (a linha correspondente já é inválida). */
  errors?: readonly ImportRowError[];
  /** Campos obrigatórios sem coluna (vindos de `applyMapping`). */
  missingFields?: readonly string[];
}

/** Valida linhas já mapeadas e coagidas; devolve as válidas tipadas e o relatório. */
export function validateDataset<K extends DatasetKey>(
  dataset: K,
  input: ValidateDatasetInput,
): DatasetImportResult<DatasetRowTypes[K]> {
  const spec = DATASETS[dataset];
  const schema = DATASET_SCHEMAS[dataset];
  const errors: ImportRowError[] = [...(input.errors ?? [])];
  const rowsWithCoercionError = new Set(errors.map((error) => error.row));
  // Campo cuja coerção já falhou (virou null) não ganha um segundo erro "obrigatório" do schema.
  const fieldsWithCoercionError = new Set(errors.map((error) => `${error.row}:${error.field}`));

  const valid: DatasetRowTypes[K][] = [];
  const seenKeys = new Set<string>();
  let invalid = 0;
  let duplicates = 0;

  for (const row of input.rows) {
    const parsed = schema.safeParse(row.values);
    if (!parsed.success) {
      invalid += 1;
      for (const issue of parsed.error.issues) {
        const error = issueToError(issue, row);
        if (!fieldsWithCoercionError.has(`${error.row}:${error.field}`)) errors.push(error);
      }
      continue;
    }
    if (rowsWithCoercionError.has(row.row)) {
      invalid += 1;
      continue;
    }
    const data = parsed.data as DatasetRowTypes[K];
    const key = naturalKeyOf(data as Record<string, unknown>, spec.naturalKey);
    if (seenKeys.has(key)) {
      duplicates += 1;
      const keyText = spec.naturalKey
        .map((k) => String((data as Record<string, unknown>)[k]))
        .join(' / ');
      errors.push({
        row: row.row,
        field: null,
        code: 'DUPLICATE',
        message: `Linha repetida para ${keyText}; a primeira ocorrência foi mantida.`,
      });
      continue;
    }
    seenKeys.add(key);
    valid.push(data);
  }

  errors.sort((a, b) => a.row - b.row || (a.field ?? '').localeCompare(b.field ?? ''));
  const report: ImportReport = {
    total: input.rows.length,
    valid: valid.length,
    invalid,
    duplicates,
    missingFields: [...(input.missingFields ?? [])],
    errors,
  };
  return { rows: valid, report };
}

/**
 * Atalho completo para uma tabela: mapeia (sugerindo o mapeamento quando não informado), coage e
 * valida. É o que a API chama no preview e na confirmação (§34).
 */
export function importDataset<K extends DatasetKey>(
  dataset: K,
  rows: readonly RawRow[],
  mapping?: Mapping,
  headers?: readonly string[],
): DatasetImportResult<DatasetRowTypes[K]> {
  const effectiveMapping =
    mapping ?? suggestMapping(headers ?? Object.keys(rows[0] ?? {}), dataset).mapping;
  const applied = applyMapping(rows, effectiveMapping, dataset);
  return validateDataset(dataset, applied);
}

/** Relatório vazio (útil para a API iniciar um `import_job`). */
export function emptyReport(): ImportReport {
  return { total: 0, valid: 0, invalid: 0, duplicates: 0, missingFields: [], errors: [] };
}

/** Soma relatórios de várias tabelas num só (resumo do job). */
export function mergeReports(reports: readonly ImportReport[]): ImportReport {
  const merged = emptyReport();
  for (const report of reports) {
    merged.total += report.total;
    merged.valid += report.valid;
    merged.invalid += report.invalid;
    merged.duplicates += report.duplicates;
    for (const field of report.missingFields) {
      if (!merged.missingFields.includes(field)) merged.missingFields.push(field);
    }
    merged.errors.push(...report.errors);
  }
  return merged;
}
