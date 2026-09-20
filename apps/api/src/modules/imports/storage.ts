/**
 * Onde o arquivo importado fica guardado.
 *
 * Bucket PRIVADO "imports" do Supabase Storage, separado do de documentos: são coisas
 * diferentes (um vira métrica por leitura de texto, o outro vira linha de tabela) e o limite de
 * tamanho é outro (20 MB contra 10 MB). O contrato é o mesmo `DocumentStorage`, então a
 * implementação do Supabase e a em memória dos testes servem para os dois.
 *
 * Caminho: <organizationId>/<importJobId>/<nome-seguro> — o primeiro segmento é o tenant, o que
 * permite policy por prefixo no bucket.
 *
 * Guardar o original importa: a confirmação relê o arquivo do storage e valida de novo, em vez
 * de confiar no que o navegador mandou no preview (§45).
 */
import { sanitizeFileName } from '../../infrastructure/storage/document-storage.js';

// O nome do bucket vive na infraestrutura porque o arquivo da organização (§35) também
// precisa dele para ler, só leitura, as planilhas que a importação guardou aqui.
export { IMPORTS_BUCKET } from '../../infrastructure/storage/supabase-storage.js';

export function buildImportObjectPath(
  organizationId: string,
  importJobId: string,
  fileName: string,
): string {
  return `${organizationId}/${importJobId}/${sanitizeFileName(fileName)}`;
}
