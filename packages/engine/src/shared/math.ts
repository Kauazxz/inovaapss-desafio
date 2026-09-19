import { clampScore } from '@inovaapss/shared';

/** Número finito (nem NaN nem ±Infinity). Dado inválido é tratado como ausente (N/A). */
export function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

/** Arredonda para `digits` casas (padrão 2) — só para apresentação e explicações. */
export function round(value: number, digits = 2): number {
  const factor = 10 ** digits;
  return Math.round((value + Number.EPSILON) * factor) / factor;
}

/** Limita à escala 0–100 e arredonda a 2 casas. `null` passa direto (N/A). */
export function toHealth(value: number | null): number | null {
  if (value === null || !Number.isFinite(value)) return null;
  return round(clampScore(value), 2);
}

/** Interpolação linear entre dois pontos, limitada ao intervalo [y0, y1] (em qualquer ordem). */
export function interpolate(x: number, x0: number, y0: number, x1: number, y1: number): number {
  if (x1 === x0) return x <= x0 ? y0 : y1;
  const t = (x - x0) / (x1 - x0);
  const clampedT = Math.min(1, Math.max(0, t));
  return y0 + (y1 - y0) * clampedT;
}

export function mean(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  return values.reduce((acc, v) => acc + v, 0) / values.length;
}

export function median(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) return sorted[mid] as number;
  return ((sorted[mid - 1] as number) + (sorted[mid] as number)) / 2;
}

/**
 * Detecta outliers pela distância à mediana, em escala robusta:
 * MAD escalado (1,4826 × MAD); se o MAD for zero (muitos valores iguais), usa o desvio absoluto
 * médio escalado (1,2533 × MeanAD). Sem escala (tudo igual) → nenhum outlier.
 */
export function detectOutliers(values: readonly number[], factor = 3): boolean[] {
  if (values.length < 3) return values.map(() => false);
  const med = median(values) as number;
  const absDev = values.map((v) => Math.abs(v - med));
  const mad = median(absDev) as number;
  let scale = mad * 1.4826;
  if (scale === 0) {
    scale = (mean(absDev) as number) * 1.2533;
  }
  if (scale === 0) return values.map(() => false);
  return absDev.map((d) => d > factor * scale);
}

/**
 * Regressão linear simples sobre pontos igualmente espaçados (x = 0, 1, 2, ...).
 * Devolve a inclinação (unidades por período) ou `null` com menos de 2 pontos.
 * Com exatamente 2 pontos é o delta simples.
 */
export function linearSlope(values: readonly number[]): number | null {
  const n = values.length;
  if (n < 2) return null;
  const xMean = (n - 1) / 2;
  const yMean = mean(values) as number;
  let num = 0;
  let den = 0;
  values.forEach((y, x) => {
    num += (x - xMean) * (y - yMean);
    den += (x - xMean) ** 2;
  });
  return den === 0 ? 0 : num / den;
}

/** Soma dos pesos, ignorando entradas inválidas. */
export function sumWeights(weights: readonly number[]): number {
  return weights.reduce((acc, w) => acc + (isFiniteNumber(w) && w > 0 ? w : 0), 0);
}

/** Quantos minutos entre dois instantes ISO 8601 (`b - a`). `null` se alguma data for inválida. */
export function minutesBetween(aIso: string, bIso: string): number | null {
  const a = Date.parse(aIso);
  const b = Date.parse(bIso);
  if (Number.isNaN(a) || Number.isNaN(b)) return null;
  return (b - a) / 60_000;
}
