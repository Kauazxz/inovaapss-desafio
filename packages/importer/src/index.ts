/**
 * @inovaapss/importer — núcleo puro do importador (§34, §44, ajuste A4).
 *
 * Leitura (XLSX, CSV, JSON) → detecção de colunas → mapeamento com coerção de tipos → validação
 * Zod + duplicidade → relatório. Sem banco, sem Express: a API (Etapa 7) chama estas funções no
 * preview e na confirmação e persiste `import_jobs` / `import_row_errors`. Guia em docs/IMPORTS.md.
 */
export * from './datasets/index.js';
export * from './mapping/index.js';
export * from './presets/index.js';
export * from './readers/index.js';
export * from './shared/index.js';
export * from './types.js';
export * from './validation/index.js';
