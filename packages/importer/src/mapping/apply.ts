/**
 * Aplica um mapeamento (campo → cabeçalho) às linhas cruas e coage cada valor para o tipo do
 * campo. Erros de coerção entram na lista de erros com a linha e o campo; a linha continua no
 * resultado (com `null` no campo) para que a validação aponte todos os problemas de uma vez.
 */
import { DATASETS } from '../datasets/catalog.js';
import {
  coerceBoolean,
  coerceDate,
  coerceEnum,
  coerceInteger,
  coerceNumber,
  coercePeriod,
  coerceText,
  type CoerceResult,
} from '../shared/coerce.js';
import {
  type ApplyMappingResult,
  type DatasetKey,
  type DatasetSpec,
  type FieldSpec,
  type ImportErrorCode,
  type ImportRowError,
  type MappedRow,
  type Mapping,
  type RawRow,
} from '../types.js';

const ERROR_CODE_BY_TYPE: Readonly<Record<FieldSpec['type'], ImportErrorCode>> = {
  text: 'INVALID_TEXT',
  integer: 'INVALID_INTEGER',
  number: 'INVALID_NUMBER',
  period: 'INVALID_PERIOD',
  date: 'INVALID_DATE',
  boolean: 'INVALID_BOOLEAN',
  enum: 'INVALID_ENUM',
};

/** Coage um valor cru conforme o tipo do campo. */
export function coerceField(value: unknown, field: FieldSpec): CoerceResult<unknown> {
  switch (field.type) {
    case 'text':
      return coerceText(value);
    case 'integer':
      return coerceInteger(value);
    case 'number':
      return coerceNumber(value);
    case 'period':
      return coercePeriod(value);
    case 'date':
      return coerceDate(value);
    case 'boolean':
      return coerceBoolean(value);
    case 'enum':
      return coerceEnum(value, field.enumValues ?? {});
  }
}

/**
 * Campos obrigatórios sem cabeçalho no mapeamento (ou cujo cabeçalho não existe no arquivo).
 * `headers` é opcional: sem ele, só confere se o campo tem cabeçalho no mapeamento.
 */
export function missingRequiredFields(
  dataset: DatasetSpec,
  mapping: Mapping,
  headers?: readonly string[],
): string[] {
  return dataset.fields
    .filter((field) => {
      if (!field.required) return false;
      const header = mapping[field.key];
      if (header === null || header === undefined) return true;
      return headers !== undefined && !headers.includes(header);
    })
    .map((field) => field.key);
}

/**
 * `rows` são as linhas cruas do leitor (chave = cabeçalho original). O resultado tem uma linha
 * por linha de entrada, com TODOS os campos do dataset (ausentes = `null`).
 */
export function applyMapping(
  rows: readonly RawRow[],
  mapping: Mapping,
  dataset: DatasetSpec | DatasetKey,
): ApplyMappingResult {
  const spec = typeof dataset === 'string' ? DATASETS[dataset] : dataset;
  const errors: ImportRowError[] = [];
  const mapped: MappedRow[] = rows.map((raw, index) => {
    const row = index + 1;
    const values: Record<string, unknown> = {};
    for (const field of spec.fields) {
      const header = mapping[field.key];
      const rawValue = header === null || header === undefined ? null : raw[header];
      const result = coerceField(rawValue, field);
      if (result.ok) {
        values[field.key] = result.value;
      } else {
        values[field.key] = null;
        errors.push({
          row,
          field: field.key,
          code: ERROR_CODE_BY_TYPE[field.type],
          message: `${field.label}: ${result.message}`,
        });
      }
    }
    return { row, values };
  });
  return { rows: mapped, errors, missingFields: missingRequiredFields(spec, mapping) };
}
