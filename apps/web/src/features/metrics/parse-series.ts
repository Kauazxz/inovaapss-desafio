/**
 * "90, 85.5, 80" → [90, 85.5, 80]. Separadores: vírgula, ponto e vírgula ou quebra de linha;
 * decimal com ponto. "x", "n/a" ou vazio no meio vira null (período sem dado, nunca zero).
 */
export function parseSeriesText(text: string): (number | null)[] {
  return text
    .split(/[,;\n]/)
    .map((part) => part.trim())
    .filter((part, index, all) => part !== '' || index < all.length - 1)
    .map((part) => {
      if (part === '' || part.toLowerCase() === 'x' || part.toLowerCase() === 'n/a') return null;
      const parsed = Number(part);
      return Number.isFinite(parsed) ? parsed : null;
    });
}
