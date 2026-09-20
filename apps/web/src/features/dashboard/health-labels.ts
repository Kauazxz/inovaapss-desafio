/**
 * Rótulos da classe de saúde, em texto.
 *
 * Ficam fora do arquivo das pílulas porque um módulo que exporta componentes React não pode
 * exportar também constantes sem quebrar a recarga rápida do Vite.
 */
import type { HealthClass } from '@inovaapss/shared';

export const HEALTH_STATUS_LABELS: Readonly<Record<HealthClass, string>> = {
  NORMAL: 'Saúde normal',
  ATTENTION: 'Saúde em atenção',
  RISK: 'Saúde em risco',
  CRITICAL: 'Saúde crítica',
};
