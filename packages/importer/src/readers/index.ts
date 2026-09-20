import { type ImportFileType } from '@inovaapss/shared';

import { type ReadResult } from '../types.js';
import { type CsvInput, readCsv } from './csv.js';
import { type JsonInput, readJson } from './json.js';
import { readWorkbook, type WorkbookInput } from './xlsx.js';

export { detectDelimiter, readCsv, type CsvInput } from './csv.js';
export { readJson, type JsonInput } from './json.js';
export { sheetFromMatrix, sheetFromObjects } from './sheet.js';
export { readWorkbook, writeWorkbook, type WorkbookInput } from './xlsx.js';

/** Ponto único para a API: escolhe o leitor pelo tipo do arquivo (§34 + A4). */
export function readTabular(
  input: WorkbookInput | CsvInput | JsonInput,
  fileType: ImportFileType,
): ReadResult {
  switch (fileType) {
    case 'XLSX':
      return readWorkbook(input as WorkbookInput);
    case 'CSV':
      return { sheets: [readCsv(input as CsvInput)] };
    case 'JSON':
      return readJson(input);
  }
}
