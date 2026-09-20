/**
 * Normalização de cabeçalhos: "Valor Mensal (R$)" → "valor_mensal_r". Sempre determinística; o
 * original é preservado em `TabularSheet.headers` para a interface mostrar o que o usuário viu.
 */

/** Remove acentos (NFD + faixa de diacríticos). */
export function stripAccents(text: string): string {
  return text.normalize('NFD').replace(/[̀-ͯ]/g, '');
}

/** trim → minúsculas → sem acento → tudo que não é letra/dígito vira `_` → sem `_` nas pontas. */
export function normalizeHeader(header: string): string {
  return stripAccents(String(header).trim())
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

/** Tokens de um cabeçalho normalizado ("valor_mensal_r" → ["valor", "mensal", "r"]). */
export function headerTokens(normalized: string): string[] {
  return normalized.split('_').filter((token) => token.length > 0);
}

/**
 * Garante cabeçalhos únicos e não vazios: vazio vira `coluna_N` (N = posição, começando em 1) e
 * repetido ganha sufixo `_2`, `_3`...
 */
export function uniqueHeaders(headers: readonly unknown[]): string[] {
  const seen = new Map<string, number>();
  return headers.map((raw, index) => {
    const text = raw === null || raw === undefined ? '' : String(raw).trim();
    const base = text.length > 0 ? text : `coluna_${index + 1}`;
    const count = seen.get(base) ?? 0;
    seen.set(base, count + 1);
    return count === 0 ? base : `${base}_${count + 1}`;
  });
}
