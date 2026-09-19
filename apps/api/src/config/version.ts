import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Versão da API, lida do package.json ao lado (mesma profundidade em src/ e em dist/).
 * Cai para 0.0.0 se o arquivo não puder ser lido (ex.: imagem montada de outro jeito).
 */
export function readPackageVersion(): string {
  try {
    const here = path.dirname(fileURLToPath(import.meta.url));
    const raw = readFileSync(path.resolve(here, '../../package.json'), 'utf8');
    const pkg = JSON.parse(raw) as { version?: unknown };
    return typeof pkg.version === 'string' ? pkg.version : '0.0.0';
  } catch {
    return '0.0.0';
  }
}

export const API_VERSION = readPackageVersion();
