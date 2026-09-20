/** Formatos próprios da calibração: peso em percentual e a mudança em pontos percentuais. */

/** `12,0 %` — peso vem do motor como fração 0–1. */
export function formatWeight(weight: number): string {
  return `${(weight * 100).toLocaleString('pt-BR', {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  })} %`;
}

/**
 * `+2,0 p.p.` — a mudança sugerida, sempre com sinal.
 * Peso é percentual: a diferença entre dois percentuais se diz em pontos, não em "%".
 */
export function formatWeightDelta(delta: number): string {
  const pontos = delta * 100;
  if (Math.abs(pontos) < 0.05) return 'sem mudança';
  return `${pontos.toLocaleString('pt-BR', {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
    signDisplay: 'exceptZero',
  })} p.p.`;
}
