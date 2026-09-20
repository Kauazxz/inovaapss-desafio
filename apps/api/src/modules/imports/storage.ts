/**
 * Onde o arquivo importado fica guardado.
 *
 * Bucket PRIVADO "imports", separado do "documents" porque são coisas diferentes: aqui o arquivo
 * existe para ser RELIDO na prévia e na confirmação (a API nunca confia no que o navegador mandou
 * no passo anterior), não para ser baixado por alguém. Caminho:
 * `<organization_id>/<import_job_id>/<nome-seguro>` — o primeiro segmento é o tenant, como no
 * bucket de documentos, e o nome nunca vem do cliente na hora de ler: é derivado do job.
 */
import { sanitizeFileName } from '../../infrastructure/storage/document-storage.js';

export const IMPORTS_BUCKET = 'imports';

export function buildImportObjectPath(
  organizationId: string,
  importJobId: string,
  fileName: string,
): string {
  return `${organizationId}/${importJobId}/${sanitizeFileName(fileName)}`;
}
