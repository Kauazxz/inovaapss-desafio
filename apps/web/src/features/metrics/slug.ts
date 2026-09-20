/**
 * Chave (slug) sugerida a partir do nome da métrica (§31). A chave é a identidade estável da
 * métrica na organização: é por ela que a importação liga as colunas da planilha, então ela não
 * carrega acento nem espaço.
 */
/** Nome → chave: sem acento, minúsculo, separado por `_` (padrão do preset GlobalSys). */
export function suggestSlug(name: string): string {
  return name
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 64);
}
