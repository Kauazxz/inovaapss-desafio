/**
 * @inovaapss/engine — motor puro de saúde, risco, prioridade, forecast e SLA.
 *
 * Sem banco, sem Express, sem React: só funções determinísticas sobre dados de entrada.
 * A API (Etapas 3–5) monta as entradas a partir das tabelas e persiste os resultados em snapshots.
 */
export * from './calibration/index.js';
export * from './scoring/index.js';
export * from './shared/index.js';
export * from './sla/index.js';
