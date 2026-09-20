/**
 * Leitura de JSON (ajuste A4). Formatos aceitos:
 *   1. array de objetos                          → uma tabela `json`
 *   2. objeto de arrays de objetos               → uma tabela por chave (como abas de planilha)
 *   3. objeto de arrays de valores (colunar)     → uma tabela `json`; cada chave é uma coluna
 * Objetos aninhados dentro das linhas não são achatados: viram erro de coerção no mapeamento.
 */
import { ImportReadError } from '../shared/errors.js';
import { type RawRow, type ReadResult } from '../types.js';
import { sheetFromObjects } from './sheet.js';

export type JsonInput = string | Buffer | Uint8Array | unknown;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isObjectArray(value: unknown): value is RawRow[] {
  return Array.isArray(value) && value.every((item) => isPlainObject(item));
}

function isPrimitiveArray(value: unknown): value is unknown[] {
  return (
    Array.isArray(value) && value.every((item) => !isPlainObject(item) && !Array.isArray(item))
  );
}

function parseInput(input: JsonInput): unknown {
  if (typeof input === 'string' || Buffer.isBuffer(input) || input instanceof Uint8Array) {
    const text = typeof input === 'string' ? input : Buffer.from(input).toString('utf8');
    const clean = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
    if (clean.trim().length === 0) throw new ImportReadError('O arquivo JSON está vazio.');
    try {
      return JSON.parse(clean) as unknown;
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      throw new ImportReadError(`JSON inválido: ${detail}`);
    }
  }
  return input;
}

/** Lê JSON (texto, bytes ou valor já interpretado) e devolve uma ou mais tabelas. */
export function readJson(input: JsonInput): ReadResult {
  const data = parseInput(input);

  if (isObjectArray(data)) {
    return { sheets: [sheetFromObjects('json', data)] };
  }

  if (isPlainObject(data)) {
    const entries = Object.entries(data);
    if (entries.length > 0 && entries.every(([, value]) => isObjectArray(value))) {
      return {
        sheets: entries.map(([name, value]) => sheetFromObjects(name, value as RawRow[])),
      };
    }
    if (entries.length > 0 && entries.every(([, value]) => isPrimitiveArray(value))) {
      const columns = entries as [string, unknown[]][];
      const length = Math.max(...columns.map(([, values]) => values.length));
      const objects: RawRow[] = [];
      for (let index = 0; index < length; index += 1) {
        const row: RawRow = {};
        for (const [name, values] of columns) row[name] = values[index] ?? null;
        objects.push(row);
      }
      return { sheets: [sheetFromObjects('json', objects)] };
    }
  }

  throw new ImportReadError(
    'JSON em formato não reconhecido: use um array de objetos, um objeto de arrays de objetos ou um objeto de colunas.',
  );
}
