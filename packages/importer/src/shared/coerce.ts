/**
 * Coerção de tipos: transforma o que veio do arquivo (texto, número, Date, serial do Excel) no
 * valor canônico de cada tipo de campo. Cada função devolve `{ ok, value }` ou `{ ok: false,
 * message }` — nunca lança. Célula vazia vira `null` em qualquer tipo.
 */
import { normalizeHeader } from './headers.js';

export type CoerceResult<T> = { ok: true; value: T | null } | { ok: false; message: string };

/** `null`, `undefined`, string vazia ou só espaços. */
export function isBlank(value: unknown): boolean {
  if (value === null || value === undefined) return true;
  if (typeof value === 'string') return value.trim().length === 0;
  if (typeof value === 'number') return Number.isNaN(value);
  return false;
}

export function coerceText(value: unknown): CoerceResult<string> {
  if (isBlank(value)) return { ok: true, value: null };
  if (value instanceof Date) return { ok: true, value: toIsoDate(value) };
  if (typeof value === 'object') return { ok: false, message: 'Valor não é um texto.' };
  return { ok: true, value: String(value).trim() };
}

/**
 * Número com vírgula decimal ("1.234,56", "64,3%", "R$ 9.800") ou ponto ("1234.56"). Regra:
 * quando há vírgula e ponto, o ÚLTIMO separador é o decimal; só vírgula → decimal; só ponto → decimal.
 */
export function coerceNumber(value: unknown): CoerceResult<number> {
  if (isBlank(value)) return { ok: true, value: null };
  if (typeof value === 'number') {
    return Number.isFinite(value)
      ? { ok: true, value }
      : { ok: false, message: 'Número inválido.' };
  }
  if (typeof value === 'boolean') return { ok: true, value: value ? 1 : 0 };
  if (typeof value !== 'string') return { ok: false, message: 'Valor não é um número.' };

  let text = value
    .trim()
    .replace(/^r\$\s*/i, '')
    .replace(/%$/, '')
    .replace(/\s+/g, '')
    .replace(/^\+/, '')
    .replace(/^−/, '-');
  const lastComma = text.lastIndexOf(',');
  const lastDot = text.lastIndexOf('.');
  if (lastComma >= 0 && lastDot >= 0) {
    text = lastComma > lastDot ? text.replace(/\./g, '').replace(',', '.') : text.replace(/,/g, '');
  } else if (lastComma >= 0) {
    text = text.replace(',', '.');
  }
  if (!/^-?\d+(\.\d+)?$/.test(text)) {
    return { ok: false, message: `"${value.trim()}" não é um número.` };
  }
  const parsed = Number(text);
  return Number.isFinite(parsed)
    ? { ok: true, value: parsed }
    : { ok: false, message: `"${value.trim()}" não é um número.` };
}

export function coerceInteger(value: unknown): CoerceResult<number> {
  const result = coerceNumber(value);
  if (!result.ok || result.value === null) return result;
  if (!Number.isInteger(result.value)) {
    return { ok: false, message: `"${String(value).trim()}" não é um número inteiro.` };
  }
  return result;
}

const TRUE_WORDS = new Set(['1', 'true', 'sim', 's', 'yes', 'y', 'verdadeiro', 'v', 'x']);
const FALSE_WORDS = new Set(['0', 'false', 'nao', 'n', 'no', 'falso', 'f']);

/** 0/1, true/false, sim/não, s/n, yes/no. */
export function coerceBoolean(value: unknown): CoerceResult<boolean> {
  if (isBlank(value)) return { ok: true, value: null };
  if (typeof value === 'boolean') return { ok: true, value };
  if (typeof value === 'number') {
    if (value === 1) return { ok: true, value: true };
    if (value === 0) return { ok: true, value: false };
    return { ok: false, message: `"${value}" não é um valor sim/não (use 0/1).` };
  }
  if (typeof value !== 'string') return { ok: false, message: 'Valor não é sim/não.' };
  const word = normalizeHeader(value);
  if (TRUE_WORDS.has(word)) return { ok: true, value: true };
  if (FALSE_WORDS.has(word)) return { ok: true, value: false };
  return { ok: false, message: `"${value.trim()}" não é um valor sim/não.` };
}

// ---------- Datas e períodos ----------

const MONTH_NAMES: Readonly<Record<string, number>> = {
  jan: 1,
  janeiro: 1,
  january: 1,
  fev: 2,
  feb: 2,
  fevereiro: 2,
  february: 2,
  mar: 3,
  marco: 3,
  march: 3,
  abr: 4,
  apr: 4,
  abril: 4,
  april: 4,
  mai: 5,
  may: 5,
  maio: 5,
  jun: 6,
  junho: 6,
  june: 6,
  jul: 7,
  julho: 7,
  july: 7,
  ago: 8,
  aug: 8,
  agosto: 8,
  august: 8,
  set: 9,
  sep: 9,
  sept: 9,
  setembro: 9,
  september: 9,
  out: 10,
  oct: 10,
  outubro: 10,
  october: 10,
  nov: 11,
  novembro: 11,
  november: 11,
  dez: 12,
  dec: 12,
  dezembro: 12,
  december: 12,
};

const pad2 = (n: number): string => String(n).padStart(2, '0');

const DAY_MS = 86_400_000;
/** Tolerância para reconhecer "meia-noite": o SheetJS cria datas locais com desvio de segundos. */
const MIDNIGHT_TOLERANCE_MS = 5 * 60_000;

interface Ymd {
  year: number;
  month: number;
  day: number | null;
}

/**
 * Ano/mês/dia de um `Date`. Datas de planilha (SheetJS) são meia-noite LOCAL, às vezes com desvio
 * de alguns segundos; datas de JSON (`"2020-02-01"`) são meia-noite UTC. Por isso: perto da
 * meia-noite local → calendário local; senão, perto da meia-noite UTC → calendário UTC; senão local.
 */
export function dateToYmd(date: Date): { year: number; month: number; day: number } {
  const localMs =
    ((date.getHours() * 60 + date.getMinutes()) * 60 + date.getSeconds()) * 1000 +
    date.getMilliseconds();
  if (localMs <= MIDNIGHT_TOLERANCE_MS || DAY_MS - localMs <= MIDNIGHT_TOLERANCE_MS) {
    const shifted = new Date(date.getTime() + MIDNIGHT_TOLERANCE_MS);
    return { year: shifted.getFullYear(), month: shifted.getMonth() + 1, day: shifted.getDate() };
  }
  const utcMs =
    ((date.getUTCHours() * 60 + date.getUTCMinutes()) * 60 + date.getUTCSeconds()) * 1000 +
    date.getUTCMilliseconds();
  if (utcMs <= MIDNIGHT_TOLERANCE_MS || DAY_MS - utcMs <= MIDNIGHT_TOLERANCE_MS) {
    const shifted = new Date(date.getTime() + MIDNIGHT_TOLERANCE_MS);
    return {
      year: shifted.getUTCFullYear(),
      month: shifted.getUTCMonth() + 1,
      day: shifted.getUTCDate(),
    };
  }
  return { year: date.getFullYear(), month: date.getMonth() + 1, day: date.getDate() };
}

/** Data → "YYYY-MM-DD" (regra de calendário em `dateToYmd`). */
export function toIsoDate(date: Date): string {
  const { year, month, day } = dateToYmd(date);
  return `${year}-${pad2(month)}-${pad2(day)}`;
}

/** Serial de data do Excel (dias desde 1899-12-30) → Date em UTC. */
export function excelSerialToDate(serial: number): Date {
  return new Date(Math.round((serial - 25569) * 86_400_000));
}

function looksLikeExcelSerial(value: number): boolean {
  return Number.isFinite(value) && value >= 20_000 && value <= 80_000;
}

function validYmd(year: number, month: number, day: number): boolean {
  if (month < 1 || month > 12 || day < 1) return false;
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return day <= daysInMonth;
}

/** Interpreta os formatos aceitos de data/período; `null` quando não reconhece. */
function parseYmd(raw: string): Ymd | null {
  const text = raw.trim();
  let match: RegExpMatchArray | null;

  // 2025-03, 2025/03, 2025-3
  if ((match = /^(\d{4})[-/.](\d{1,2})$/.exec(text))) {
    return { year: Number(match[1]), month: Number(match[2]), day: null };
  }
  // 2025-03-01, 2025/03/01, 2025-03-01T00:00:00Z
  if ((match = /^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})(?:[T\s].*)?$/.exec(text))) {
    return { year: Number(match[1]), month: Number(match[2]), day: Number(match[3]) };
  }
  // 03/2025, 3-2025
  if ((match = /^(\d{1,2})[-/.](\d{4})$/.exec(text))) {
    return { year: Number(match[2]), month: Number(match[1]), day: null };
  }
  // 01/03/2025 (dia/mês/ano — convenção brasileira)
  if ((match = /^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})$/.exec(text))) {
    return { year: Number(match[3]), month: Number(match[2]), day: Number(match[1]) };
  }
  // 202503
  if ((match = /^(\d{4})(\d{2})$/.exec(text))) {
    return { year: Number(match[1]), month: Number(match[2]), day: null };
  }
  // mar/2025, março 2025, mar-25
  if ((match = /^([a-zA-Zçã]+)[\s/.-]+(\d{2}|\d{4})$/.exec(text))) {
    const month = MONTH_NAMES[normalizeHeader(match[1] ?? '')];
    if (month === undefined) return null;
    const yearText = match[2] ?? '';
    const year = yearText.length === 2 ? 2000 + Number(yearText) : Number(yearText);
    return { year, month, day: null };
  }
  return null;
}

interface DateKindMessages {
  /** Valor textual/numérico não reconhecido. */
  invalid: (raw: string) => string;
  /** Tipo que não pode ser data (objeto, Date inválido). */
  notADate: string;
}

const PERIOD_MESSAGES: DateKindMessages = {
  invalid: (raw) => `"${raw}" não é um período reconhecido (AAAA-MM).`,
  notADate: 'Valor não é um período (AAAA-MM).',
};

const DATE_MESSAGES: DateKindMessages = {
  invalid: (raw) => `"${raw}" não é uma data reconhecida.`,
  notADate: 'Valor não é uma data.',
};

function ymdFromValue(value: unknown, messages: DateKindMessages): CoerceResult<Ymd> {
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return { ok: false, message: messages.notADate };
    return { ok: true, value: dateToYmd(value) };
  }
  if (typeof value === 'number') {
    if (!looksLikeExcelSerial(value))
      return { ok: false, message: messages.invalid(String(value)) };
    return ymdFromValue(excelSerialToDate(value), messages);
  }
  if (typeof value !== 'string') return { ok: false, message: messages.notADate };
  const parsed = parseYmd(value);
  if (parsed === null || !validYmd(parsed.year, parsed.month, parsed.day ?? 1)) {
    return { ok: false, message: messages.invalid(value.trim()) };
  }
  return { ok: true, value: parsed };
}

/** Período mensal canônico "YYYY-MM". Aceita YYYY-MM, YYYY-MM-DD, MM/YYYY, DD/MM/YYYY, mar/2025, Date, serial. */
export function coercePeriod(value: unknown): CoerceResult<string> {
  if (isBlank(value)) return { ok: true, value: null };
  const result = ymdFromValue(value, PERIOD_MESSAGES);
  if (!result.ok) return result;
  const ymd = result.value as Ymd;
  return { ok: true, value: `${ymd.year}-${pad2(ymd.month)}` };
}

/** Data canônica "YYYY-MM-DD". Aceita YYYY-MM-DD, DD/MM/YYYY, YYYY-MM (dia 1), Date, serial do Excel. */
export function coerceDate(value: unknown): CoerceResult<string> {
  if (isBlank(value)) return { ok: true, value: null };
  const result = ymdFromValue(value, DATE_MESSAGES);
  if (!result.ok) return result;
  const ymd = result.value as Ymd;
  return { ok: true, value: `${ymd.year}-${pad2(ymd.month)}-${pad2(ymd.day ?? 1)}` };
}

/** Valor categórico: normaliza e procura na tabela `enumValues` (chave normalizada → canônico). */
export function coerceEnum(
  value: unknown,
  enumValues: Readonly<Record<string, string>>,
): CoerceResult<string> {
  const text = coerceText(value);
  if (!text.ok || text.value === null) return text;
  const canonical = enumValues[normalizeHeader(text.value)];
  if (canonical === undefined) {
    const accepted = Array.from(new Set(Object.values(enumValues))).join(', ');
    return { ok: false, message: `"${text.value}" não é um valor aceito (${accepted}).` };
  }
  return { ok: true, value: canonical };
}
