/**
 * Monta um `TabularSheet` a partir de uma matriz (linhas de células). Regra comum aos três
 * formatos: a primeira linha com alguma célula preenchida é o cabeçalho; as seguintes são dados;
 * linhas totalmente vazias são descartadas; célula vazia vira `null`.
 */
import { isBlank } from '../shared/coerce.js';
import { normalizeHeader, uniqueHeaders } from '../shared/headers.js';
import { type RawRow, type TabularSheet } from '../types.js';

function rowIsEmpty(cells: readonly unknown[]): boolean {
  return cells.every((cell) => isBlank(cell));
}

export function sheetFromMatrix(
  name: string,
  matrix: readonly (readonly unknown[])[],
): TabularSheet {
  const headerIndex = matrix.findIndex((cells) => !rowIsEmpty(cells));
  if (headerIndex < 0) {
    return { name, headers: [], normalizedHeaders: [], rows: [] };
  }
  const headers = uniqueHeaders(matrix[headerIndex] ?? []);
  const rows: RawRow[] = [];
  for (const cells of matrix.slice(headerIndex + 1)) {
    if (rowIsEmpty(cells)) continue;
    const row: RawRow = {};
    headers.forEach((header, column) => {
      const cell = cells[column];
      row[header] = isBlank(cell) ? null : cell;
    });
    rows.push(row);
  }
  return { name, headers, normalizedHeaders: headers.map(normalizeHeader), rows };
}

/** Monta um `TabularSheet` a partir de objetos (JSON): cabeçalhos = união das chaves, na ordem em que aparecem. */
export function sheetFromObjects(name: string, objects: readonly RawRow[]): TabularSheet {
  const headers: string[] = [];
  const seen = new Set<string>();
  for (const object of objects) {
    for (const key of Object.keys(object)) {
      if (!seen.has(key)) {
        seen.add(key);
        headers.push(key);
      }
    }
  }
  const rows: RawRow[] = [];
  for (const object of objects) {
    const row: RawRow = {};
    let empty = true;
    for (const header of headers) {
      const cell = object[header];
      const value = isBlank(cell) ? null : cell;
      if (value !== null) empty = false;
      row[header] = value;
    }
    if (!empty) rows.push(row);
  }
  return { name, headers, normalizedHeaders: headers.map(normalizeHeader), rows };
}
