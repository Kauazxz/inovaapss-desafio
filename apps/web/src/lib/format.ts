/** Formatos de número da interface (DATAVIZ.md §2.4). Tudo em pt-BR. */

const compactCurrency = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
  notation: 'compact',
  maximumFractionDigits: 1,
});

const fullCurrency = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
  maximumFractionDigits: 0,
});

const integer = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 0 });

const signedInteger = new Intl.NumberFormat('pt-BR', {
  maximumFractionDigits: 0,
  signDisplay: 'exceptZero',
});

/** `R$ 12,4 mil` — para números grandes em texto e rótulos de gráfico. */
export function formatCompactCurrency(value: number): string {
  return compactCurrency.format(value);
}

/** `R$ 12.000` — para tabelas. */
export function formatCurrency(value: number): string {
  return fullCurrency.format(value);
}

/** `48` — health, risk, priority. */
export function formatInteger(value: number): string {
  return integer.format(value);
}

/** `+2` / `-3` — variação vs. período anterior. */
export function formatSignedInteger(value: number): string {
  return signedInteger.format(value);
}

/** `91 %` — confiança e percentuais. */
export function formatPercent(value: number): string {
  return `${integer.format(value)} %`;
}
