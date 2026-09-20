/**
 * @inovaapss/shared — vocabulário de domínio usado por API e web.
 *
 * Cada constante aponta a seção de docs/SPEC.md de onde veio. Os "enums" são objetos
 * `as const` + tipo união: funcionam em runtime (Object.values, z.enum) e somem no build.
 */

export * from './domain.js';
export * from './scoring.js';
export * from './dashboard/index.js';
export * from './metrics/index.js';
export * from './client-health/index.js';
export * from './alerts/index.js';
