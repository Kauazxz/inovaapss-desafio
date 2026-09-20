/**
 * Fonte de dados dublê da calibração: mesma interface do repositório Drizzle, em memória.
 *
 * As séries vêm prontas, como vêm das fotos no banco — assim o teste fala de regra (quem alerta,
 * quem cancela, o que a execução guarda) e não de SQL.
 */
import { randomUUID } from 'node:crypto';

import type { CalibrationClientSeries } from '@inovaapss/engine';

import type {
  CalibratableVersion,
  CalibrationRepository,
  CalibrationRunRecord,
} from '../repository.js';

export interface FakeCalibrationRepository extends CalibrationRepository {
  versions: CalibratableVersion[];
  seriesByVersion: Map<string, CalibrationClientSeries[]>;
  runs: CalibrationRunRecord[];
}

export function createFakeCalibrationRepository(): FakeCalibrationRepository {
  const versions: CalibratableVersion[] = [];
  const seriesByVersion = new Map<string, CalibrationClientSeries[]>();
  const runs: CalibrationRunRecord[] = [];

  const find = (organizationId: string, runId: string) =>
    runs.find((run) => run.organizationId === organizationId && run.id === runId) ?? null;

  return {
    versions,
    seriesByVersion,
    runs,

    async listCalibratableVersions() {
      return versions.filter((version) => version.snapshotCount > 0);
    },

    async findVersion(_organizationId, versionId) {
      if (versionId !== undefined) {
        return versions.find((v) => v.metricModelVersionId === versionId) ?? null;
      }
      return versions.find((v) => v.status === 'active') ?? versions[0] ?? null;
    },

    async loadClientSeries(_organizationId, metricModelVersionId) {
      return seriesByVersion.get(metricModelVersionId) ?? [];
    },

    async createRun(input) {
      const version = versions.find((v) => v.metricModelVersionId === input.metricModelVersionId);
      const run: CalibrationRunRecord = {
        id: randomUUID(),
        organizationId: input.organizationId,
        metricModelVersionId: input.metricModelVersionId,
        windowDays: input.windowDays,
        status: 'running',
        parametersJson: input.parameters,
        resultsJson: null,
        errorMessage: null,
        createdAt: new Date(),
        finishedAt: null,
        metricModelName: version?.metricModelName ?? null,
        version: version?.version ?? null,
      };
      runs.unshift(run);
      return run;
    },

    async finishRun(organizationId, runId, results) {
      const run = find(organizationId, runId);
      if (run === null) return null;
      run.status = 'done';
      run.resultsJson = results;
      run.errorMessage = null;
      run.finishedAt = new Date();
      return run;
    },

    async failRun(organizationId, runId, message) {
      const run = find(organizationId, runId);
      if (run === null) return null;
      run.status = 'failed';
      run.errorMessage = message;
      run.finishedAt = new Date();
      return run;
    },

    async listRuns(organizationId, limit = 20) {
      return runs.filter((run) => run.organizationId === organizationId).slice(0, limit);
    },

    async findRun(organizationId, runId) {
      return find(organizationId, runId);
    },
  };
}
