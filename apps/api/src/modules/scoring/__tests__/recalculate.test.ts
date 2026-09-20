/**
 * §32 do documento de métricas: "alterar peso, faixa ou fórmula não apaga a configuração
 * anterior, e cada score histórico sabe qual versão o gerou".
 *
 * O recálculo é o lugar onde essa regra se perde com facilidade: se ele apagar TODAS as fotos da
 * organização antes de gravar, ativar um modelo novo reescreve o histórico inteiro como se esse
 * modelo sempre tivesse existido — e a calibração, que compara o modelo da época com os
 * cancelamentos, passa a comparar com um passado que nunca aconteceu.
 *
 * Os testes abaixo rodam o recálculo contra um banco de mentira que guarda as linhas em memória
 * e aplica os DELETE de verdade, decodificando a condição que o código manda. Assim eles falham
 * tanto se o filtro por versão sumir quanto se o recálculo deixar de reescrever a própria versão.
 */
import { PgDialect } from 'drizzle-orm/pg-core';
import { describe, expect, it } from 'vitest';

import {
  clientScoreSnapshots,
  metricModelItems,
  metricModelVersions,
  metricScoreSnapshots,
  metricValues,
  portfolioClients,
} from '../../../db/schema/index.js';
import { recalculateOrganization } from '../recalculate.js';

const ORGANIZATION_ID = 'org-1';
const CLIENT_ID = 'client-1';
const METRIC_ID = 'metric-uso';
const PERIODS = ['2026-07-31', '2026-08-31', '2026-09-30'];

interface SnapshotRow {
  organizationId: string;
  metricModelVersionId: string;
  periodEnd: string;
  [key: string]: unknown;
}

const dialect = new PgDialect();

/** O que cada SELECT do recálculo devolve, escolhido pela tabela do `from`. */
function rowsFor(table: unknown, activeVersionId: string): unknown[] {
  if (table === metricModelVersions) return [{ id: activeVersionId }];
  if (table === metricModelItems) {
    return [
      {
        definitionId: METRIC_ID,
        slug: 'platform_usage',
        name: 'Uso da plataforma',
        unit: '%',
        direction: 'HIGHER_IS_BETTER',
        isActive: true,
        weight: 1,
        currentWeight: 0.45,
        trendWeight: 0.35,
        persistenceWeight: 0.2,
        normalizationConfig: { strategy: 'LINEAR_RANGE', min: 0, max: 100 },
        triggers: [],
      },
    ];
  }
  if (table === portfolioClients) {
    return [
      {
        id: CLIENT_ID,
        name: 'Cliente 1',
        externalCode: 'C1',
        strategicImportance: 3,
        monthlyValue: '1000',
        contractedSlaHours: 12,
      },
    ];
  }
  if (table === metricValues) {
    return PERIODS.map((periodEnd, index) => ({
      portfolioClientId: CLIENT_ID,
      metricDefinitionId: METRIC_ID,
      periodEnd,
      value: 90 - index * 10,
      text: null,
      answered: null,
    }));
  }
  return [];
}

/** Construtor de consulta encadeável e "awaitable", como o do Drizzle. */
function queryBuilder(resolve: (table: unknown) => unknown[]): Record<string, unknown> {
  let table: unknown = null;
  const builder: Record<string, unknown> = {
    from(source: unknown) {
      table = source;
      return builder;
    },
    innerJoin: () => builder,
    leftJoin: () => builder,
    where: () => builder,
    orderBy: () => builder,
    limit: () => builder,
    then(onFulfilled: (rows: unknown[]) => unknown, onRejected?: (error: unknown) => unknown) {
      return Promise.resolve(resolve(table)).then(onFulfilled, onRejected);
    },
  };
  return builder;
}

/**
 * Banco de mentira: guarda as linhas, aplica os DELETE decodificando a condição gerada pelo
 * Drizzle e registra cada uma para os testes conferirem o escopo.
 */
class FakeDb {
  activeVersionId: string;
  clientSnapshots: SnapshotRow[] = [];
  metricSnapshots: SnapshotRow[] = [];
  deletes: { table: unknown; scopedByVersion: boolean; params: unknown[] }[] = [];

  constructor(activeVersionId: string) {
    this.activeVersionId = activeVersionId;
  }

  select(): unknown {
    return queryBuilder((table) => rowsFor(table, this.activeVersionId));
  }

  selectDistinctOn(): unknown {
    // O subquery do contrato vigente: o recálculo só lê colunas dele.
    const subquery = {
      from: () => subquery,
      where: () => subquery,
      orderBy: () => subquery,
      as: () => ({
        portfolioClientId: portfolioClients.id,
        monthlyValue: portfolioClients.name,
        contractedSlaHours: portfolioClients.name,
      }),
    };
    return subquery;
  }

  delete(table: unknown): unknown {
    return {
      where: (condition: Parameters<PgDialect['sqlToQuery']>[0]) => {
        const query = dialect.sqlToQuery(condition);
        const scopedByVersion = query.sql.includes('metric_model_version_id');
        this.deletes.push({ table, scopedByVersion, params: query.params });
        const [organizationId, versionId] = query.params;
        const keep = (row: SnapshotRow): boolean =>
          !(
            row.organizationId === organizationId &&
            (!scopedByVersion || row.metricModelVersionId === versionId)
          );
        if (table === clientScoreSnapshots)
          this.clientSnapshots = this.clientSnapshots.filter(keep);
        if (table === metricScoreSnapshots)
          this.metricSnapshots = this.metricSnapshots.filter(keep);
        return Promise.resolve([]);
      },
    };
  }

  insert(table: unknown): unknown {
    return {
      values: (rows: SnapshotRow[]) => {
        if (table === clientScoreSnapshots) this.clientSnapshots.push(...rows);
        if (table === metricScoreSnapshots) this.metricSnapshots.push(...rows);
        const pending = Promise.resolve([]);
        return Object.assign(pending, { onConflictDoUpdate: () => Promise.resolve([]) });
      },
    };
  }
}

function versionsOf(rows: SnapshotRow[]): string[] {
  return [...new Set(rows.map((row) => row.metricModelVersionId))].sort();
}

describe('recalculateOrganization', () => {
  it('grava uma foto por período com a versão ativa', async () => {
    const db = new FakeDb('ver-1');
    const result = await recalculateOrganization(db, { organizationId: ORGANIZATION_ID });

    expect(result.modelVersionId).toBe('ver-1');
    expect(db.clientSnapshots).toHaveLength(PERIODS.length);
    expect(versionsOf(db.clientSnapshots)).toEqual(['ver-1']);
    expect(versionsOf(db.metricSnapshots)).toEqual(['ver-1']);
  });

  it('recalcular com outra versão preserva as fotos da versão anterior (§32)', async () => {
    const db = new FakeDb('ver-1');
    await recalculateOrganization(db, { organizationId: ORGANIZATION_ID });

    // A empresa muda um peso, salva a v2 e ativa: o recálculo roda de novo.
    db.activeVersionId = 'ver-2';
    await recalculateOrganization(db, { organizationId: ORGANIZATION_ID });

    expect(versionsOf(db.clientSnapshots)).toEqual(['ver-1', 'ver-2']);
    expect(versionsOf(db.metricSnapshots)).toEqual(['ver-1', 'ver-2']);
    expect(db.clientSnapshots.filter((row) => row.metricModelVersionId === 'ver-1')).toHaveLength(
      PERIODS.length,
    );
    expect(db.clientSnapshots.filter((row) => row.metricModelVersionId === 'ver-2')).toHaveLength(
      PERIODS.length,
    );
  });

  it('reescreve a própria versão sem duplicar linhas', async () => {
    const db = new FakeDb('ver-1');
    await recalculateOrganization(db, { organizationId: ORGANIZATION_ID });
    db.activeVersionId = 'ver-2';
    await recalculateOrganization(db, { organizationId: ORGANIZATION_ID });
    db.activeVersionId = 'ver-1';
    await recalculateOrganization(db, { organizationId: ORGANIZATION_ID });

    expect(db.clientSnapshots).toHaveLength(PERIODS.length * 2);
    expect(db.clientSnapshots.filter((row) => row.metricModelVersionId === 'ver-1')).toHaveLength(
      PERIODS.length,
    );
  });

  it('os DELETE são filtrados pela organização E pela versão calculada', async () => {
    const db = new FakeDb('ver-2');
    await recalculateOrganization(db, { organizationId: ORGANIZATION_ID });

    expect(db.deletes).toHaveLength(2);
    for (const removal of db.deletes) {
      expect(removal.scopedByVersion).toBe(true);
      expect(removal.params).toEqual([ORGANIZATION_ID, 'ver-2']);
    }
    expect(db.deletes.map((removal) => removal.table)).toEqual([
      clientScoreSnapshots,
      metricScoreSnapshots,
    ]);
  });

  it('não escreve alerta quando nenhum gatilho dispara', async () => {
    const db = new FakeDb('ver-1');
    const result = await recalculateOrganization(db, { organizationId: ORGANIZATION_ID });
    expect(result.alerts).toBe(0);
  });
});
