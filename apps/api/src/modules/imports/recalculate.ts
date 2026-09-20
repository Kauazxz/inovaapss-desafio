/**
 * Ponte entre a importação e o motor de scoring (§62): confirmar um arquivo refaz os scores da
 * carteira, senão o dashboard continuaria mostrando o retrato anterior.
 *
 * Fica separado do service para o service não depender do Drizzle — nos testes o recálculo é um
 * dublê e o service continua puro de banco.
 */
import type { ImportRecalculationDto } from '@inovaapss/shared';

import { recalculateOrganization } from '../scoring/recalculate.js';

import type { Database } from '../../infrastructure/db/index.js';

export function createRecalculateAfterImport(
  getDb: () => Database,
): (organizationId: string) => Promise<ImportRecalculationDto | null> {
  return async (organizationId) => {
    const result = await recalculateOrganization(getDb(), { organizationId });
    return {
      clients: result.clients,
      clientSnapshots: result.clientSnapshots,
      metricSnapshots: result.metricSnapshots,
      alerts: result.alerts,
    };
  };
}
