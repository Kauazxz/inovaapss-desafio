/**
 * Formatação de números e textos para as explicações em português. Sem `Intl` para o resultado
 * ser idêntico em qualquer ambiente (testes, API, navegador).
 */

/** `24` → "24", `24.5` → "24,5", `-19.04` → "−19" (com `digits = 0`). */
export function formatNumber(value: number, digits = 1): string {
  if (!Number.isFinite(value)) return '—';
  const factor = 10 ** digits;
  const rounded = Math.round((Math.abs(value) + Number.EPSILON) * factor) / factor;
  const [intPart, fracPart] = rounded.toFixed(digits).split('.');
  const withThousands = (intPart ?? '0').replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  const frac = fracPart ? fracPart.replace(/0+$/, '') : '';
  const sign = value < 0 && rounded !== 0 ? '−' : '';
  return frac ? `${sign}${withThousands},${frac}` : `${sign}${withThousands}`;
}

/** Sinal explícito: `+12`, `−3,5`, `0`. */
export function formatSigned(value: number, digits = 1): string {
  if (!Number.isFinite(value)) return '—';
  const text = formatNumber(Math.abs(value), digits);
  if (text === '0') return '0';
  return value > 0 ? `+${text}` : `−${text}`;
}

const PLURALS: Readonly<Record<string, string>> = {
  mês: 'meses',
  período: 'períodos',
  semana: 'semanas',
  dia: 'dias',
  trimestre: 'trimestres',
  ano: 'anos',
};

/** "3 meses", "1 período", "2 semanas". */
export function pluralize(count: number, singular: string): string {
  if (count === 1) return `1 ${singular}`;
  const plural = PLURALS[singular] ?? (singular.endsWith('s') ? singular : `${singular}s`);
  return `${formatNumber(count, 0)} ${plural}`;
}

/** Substitui `{chave}` (e `{extra.chave}`) pelos valores; chaves sem valor viram "—". */
export function fillTemplate(
  template: string,
  values: Record<string, string | number | null | undefined>,
): string {
  return template.replace(/\{([a-zA-Z0-9_.]+)\}/g, (_match, key: string) => {
    const value = values[key];
    if (value === null || value === undefined) return '—';
    return typeof value === 'number' ? formatNumber(value) : value;
  });
}
