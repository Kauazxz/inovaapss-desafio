/**
 * Tipos do importador (§34, ajuste A4). Tudo aqui é puro: nenhum tipo depende de banco ou HTTP.
 */

// ---------- Leitura ----------

/** Uma tabela lida de um arquivo (aba do XLSX, arquivo CSV ou coleção JSON). */
export interface TabularSheet {
  /** Nome da aba (XLSX), `csv` ou a chave do JSON. */
  name: string;
  /** Cabeçalhos exatamente como vieram do arquivo (com acentos, espaços e caixa originais). */
  headers: string[];
  /** Cabeçalhos normalizados (`normalizeHeader`), na mesma ordem de `headers`. */
  normalizedHeaders: string[];
  /** Linhas de dados; as chaves são os cabeçalhos ORIGINAIS. Célula vazia vira `null`. */
  rows: RawRow[];
}

/** Linha crua: chave = cabeçalho original, valor = o que a biblioteca de leitura devolveu. */
export type RawRow = Record<string, unknown>;

export interface ReadResult {
  sheets: TabularSheet[];
}

export type CsvDelimiter = ',' | ';' | '\t' | '|';

export interface ReadCsvOptions {
  /** Delimitador; sem informar, detecta entre `;` `,` `\t` `|`. */
  delimiter?: CsvDelimiter;
  /** Nome dado à tabela resultante (padrão `csv`). */
  name?: string;
}

// ---------- Catálogo de datasets ----------

export const DATASET_KEYS = ['clients', 'monthly_metrics', 'nps', 'client_status'] as const;
export type DatasetKey = (typeof DATASET_KEYS)[number];

export const FIELD_TYPES = [
  'text',
  'integer',
  'number',
  'period',
  'date',
  'boolean',
  'enum',
] as const;
export type FieldType = (typeof FIELD_TYPES)[number];

export interface FieldSpec {
  /** Identificador do campo no dataset (snake_case, em inglês). */
  key: string;
  /** Rótulo em português para a interface de mapeamento. */
  label: string;
  type: FieldType;
  /** Obrigatório: precisa de coluna mapeada e valor em toda linha. */
  required: boolean;
  /** Nomes de coluna (já normalizados) que costumam trazer este campo, em português e inglês. */
  synonyms: readonly string[];
  /** Para `enum`: valor normalizado no arquivo → valor canônico. */
  enumValues?: Readonly<Record<string, string>>;
  /** Descrição curta (interface e docs). */
  description?: string;
}

export interface DatasetSpec {
  key: DatasetKey;
  /** Nome em português para a interface. */
  label: string;
  description: string;
  /** Campos que identificam uma linha; repetição = duplicidade (§34). */
  naturalKey: readonly string[];
  fields: readonly FieldSpec[];
}

// ---------- Mapeamento ----------

/** Campo do dataset → cabeçalho ORIGINAL do arquivo (`null` = sem coluna). */
export type Mapping = Record<string, string | null>;

export interface FieldMappingSuggestion {
  field: string;
  label: string;
  required: boolean;
  /** Cabeçalho original escolhido, ou `null` quando nenhum passou do mínimo de confiança. */
  header: string | null;
  /** 0–1: 1 = nome idêntico ao campo, 0,95 = sinônimo exato, abaixo disso = parcial. */
  confidence: number;
  /** Como a escolha foi feita (para exibir no preview). */
  reason: 'exact' | 'synonym' | 'partial' | 'tokens' | 'none';
}

export interface MappingSuggestion {
  dataset: DatasetKey;
  /** Pronto para `applyMapping`. */
  mapping: Mapping;
  fields: FieldMappingSuggestion[];
  /** Cabeçalhos do arquivo que não foram usados por nenhum campo. */
  unmappedHeaders: string[];
  /** Campos obrigatórios sem coluna. */
  missingRequired: string[];
  /** Média da confiança dos campos obrigatórios (0 quando algum ficou sem coluna). */
  confidence: number;
}

export interface SuggestMappingOptions {
  /** Confiança mínima para aceitar uma coluna (padrão 0,5). */
  minConfidence?: number;
}

/** Ranking de datasets para uma lista de cabeçalhos (detecção de "que tabela é esta?"). */
export interface DatasetDetection {
  dataset: DatasetKey;
  confidence: number;
  suggestion: MappingSuggestion;
}

// ---------- Validação e relatório (§34) ----------

export const IMPORT_ERROR_CODES = [
  'MISSING_REQUIRED',
  'INVALID_TEXT',
  'INVALID_NUMBER',
  'INVALID_INTEGER',
  'INVALID_PERIOD',
  'INVALID_DATE',
  'INVALID_BOOLEAN',
  'INVALID_ENUM',
  'OUT_OF_RANGE',
  'INCONSISTENT',
  'DUPLICATE',
  'INVALID_VALUE',
] as const;
export type ImportErrorCode = (typeof IMPORT_ERROR_CODES)[number];

export interface ImportRowError {
  /** Posição entre as linhas de dados: a primeira linha depois do cabeçalho é 1. */
  row: number;
  /** Campo do dataset (não o cabeçalho do arquivo); `null` para erros da linha inteira. */
  field: string | null;
  code: ImportErrorCode;
  /** Mensagem em português, pronta para a interface. */
  message: string;
}

export interface ImportReport {
  /** Linhas de dados lidas. `total = valid + invalid + duplicates`. */
  total: number;
  valid: number;
  invalid: number;
  /** Linhas válidas repetidas pela chave natural (a primeira ocorrência fica, as demais saem). */
  duplicates: number;
  /** Campos obrigatórios sem coluna mapeada. */
  missingFields: string[];
  errors: ImportRowError[];
}

/** Linha depois do mapeamento e da coerção de tipos, antes da validação. */
export interface MappedRow {
  row: number;
  values: Record<string, unknown>;
}

export interface ApplyMappingResult {
  rows: MappedRow[];
  /** Erros de coerção (número inválido, data inválida...). A linha continua em `rows`. */
  errors: ImportRowError[];
  /** Campos obrigatórios sem coluna no mapeamento. */
  missingFields: string[];
}

export interface DatasetImportResult<T> {
  /** Linhas válidas e sem duplicidade, tipadas, na ordem do arquivo. */
  rows: T[];
  report: ImportReport;
}
