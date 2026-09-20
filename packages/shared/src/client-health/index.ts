/**
 * Contratos da visão individual do cliente (§40): `GET /clients/:id`, `/scores`, `/evidence`,
 * `/recommendations` e `/history`. Alinhados aos tipos do motor (`packages/engine`), que
 * depende deste pacote — por isso os campos são espelhados, não importados.
 */
export * from './dimensions.js';
export * from './evidence.js';
export * from './history.js';
export * from './overview.js';
export * from './recommendations.js';
export * from './scores.js';
export * from './summary.js';
