/**
 * Persistência de plans e contracts (Drizzle). Toda consulta filtra por organization_id (§5).
 *
 * `createActivating` e `updateActivating` fazem, na mesma transação, o encerramento do contrato
 * ativo anterior do cliente: é a regra "um contrato ativo por cliente" (docs/CLIENTS.md), que o
 * índice parcial `contracts_one_active_per_client` também garante no banco.
 */
import { and, asc, count, desc, eq, ne, sql, type SQL } from 'drizzle-orm';

import type { ContractSortField } from '@inovaapss/validation';

import { contracts, plans } from '../../db/schema/index.js';

import type {
  Contract,
  CreateContractInput,
  CreatePlanInput,
  ListContractsQuery,
  PaginatedContracts,
  Plan,
  UpdateContractInput,
  UpdatePlanInput,
} from './types.js';
import type { Database } from '../../infrastructure/db/index.js';
import type { PgColumn } from 'drizzle-orm/pg-core';

export interface PlansRepository {
  list(organizationId: string): Promise<Plan[]>;
  findById(organizationId: string, planId: string): Promise<Plan | null>;
  findByName(organizationId: string, name: string): Promise<Plan | null>;
  create(organizationId: string, input: CreatePlanInput): Promise<Plan>;
  update(organizationId: string, planId: string, patch: UpdatePlanInput): Promise<Plan | null>;
}

export interface ContractsRepository {
  list(organizationId: string, query: ListContractsQuery): Promise<PaginatedContracts>;
  findById(organizationId: string, contractId: string): Promise<Contract | null>;
  findActiveByClient(organizationId: string, clientId: string): Promise<Contract | null>;
  /** Insere o contrato; se ele nasce `active`, encerra antes o ativo anterior do cliente. */
  createActivating(organizationId: string, input: CreateContractInput): Promise<Contract>;
  /** Atualiza o contrato; se ele passa a `active`, encerra antes os outros ativos do cliente. */
  updateActivating(
    organizationId: string,
    contractId: string,
    patch: UpdateContractInput,
  ): Promise<Contract | null>;
}

type PlanRow = typeof plans.$inferSelect;
type ContractRow = typeof contracts.$inferSelect;

function toPlan(row: PlanRow): Plan {
  return {
    id: row.id,
    organizationId: row.organizationId,
    name: row.name,
    description: row.description,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export function toContract(row: ContractRow, planName: string | null): Contract {
  return {
    id: row.id,
    organizationId: row.organizationId,
    portfolioClientId: row.portfolioClientId,
    planId: row.planId,
    planName,
    monthlyValue: Number(row.monthlyValue),
    currency: row.currency,
    startDate: row.startDate,
    endDate: row.endDate,
    status: row.status,
    contractedSlaHours: row.contractedSlaHours,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export function createPlansRepository(getDb: () => Database): PlansRepository {
  return {
    async list(organizationId) {
      const rows = await getDb()
        .select()
        .from(plans)
        .where(eq(plans.organizationId, organizationId))
        .orderBy(asc(plans.name));
      return rows.map(toPlan);
    },

    async findById(organizationId, planId) {
      const rows = await getDb()
        .select()
        .from(plans)
        .where(and(eq(plans.organizationId, organizationId), eq(plans.id, planId)))
        .limit(1);
      const row = rows[0];
      return row === undefined ? null : toPlan(row);
    },

    async findByName(organizationId, name) {
      const rows = await getDb()
        .select()
        .from(plans)
        .where(
          and(eq(plans.organizationId, organizationId), sql`lower(${plans.name}) = lower(${name})`),
        )
        .limit(1);
      const row = rows[0];
      return row === undefined ? null : toPlan(row);
    },

    async create(organizationId, input) {
      const rows = await getDb()
        .insert(plans)
        .values({ organizationId, name: input.name, description: input.description ?? null })
        .returning();
      const row = rows[0];
      if (row === undefined) throw new Error('Falha ao criar o plano.');
      return toPlan(row);
    },

    async update(organizationId, planId, patch) {
      const values: Partial<typeof plans.$inferInsert> = { updatedAt: new Date() };
      if (patch.name !== undefined) values.name = patch.name;
      if (patch.description !== undefined) values.description = patch.description;
      const rows = await getDb()
        .update(plans)
        .set(values)
        .where(and(eq(plans.organizationId, organizationId), eq(plans.id, planId)))
        .returning();
      const row = rows[0];
      return row === undefined ? null : toPlan(row);
    },
  };
}

const CONTRACT_SORT_COLUMNS: Record<ContractSortField, PgColumn | SQL> = {
  startDate: contracts.startDate,
  endDate: contracts.endDate,
  monthlyValue: contracts.monthlyValue,
  status: contracts.status,
  createdAt: contracts.createdAt,
};

type Executor = Pick<Database, 'select' | 'insert' | 'update'>;

/**
 * Encerra os contratos ativos do cliente (menos `exceptId`): status `ended` e, se não tinham
 * data de término ou ela era posterior ao novo início, end_date = novo início.
 */
async function endActiveContracts(
  tx: Executor,
  organizationId: string,
  clientId: string,
  newStartDate: string,
  exceptId?: string,
): Promise<void> {
  const conditions: SQL[] = [
    eq(contracts.organizationId, organizationId),
    eq(contracts.portfolioClientId, clientId),
    eq(contracts.status, 'active'),
  ];
  if (exceptId !== undefined) conditions.push(ne(contracts.id, exceptId));
  await tx
    .update(contracts)
    .set({
      status: 'ended',
      endDate: sql`least(coalesce(${contracts.endDate}, ${newStartDate}::date), ${newStartDate}::date)`,
      updatedAt: new Date(),
    })
    .where(and(...conditions));
}

export function createContractsRepository(getDb: () => Database): ContractsRepository {
  const selectWithPlan = (executor: Executor) =>
    executor
      .select({ contract: contracts, planName: plans.name })
      .from(contracts)
      .leftJoin(plans, eq(plans.id, contracts.planId));

  async function findByIdWith(
    executor: Executor,
    organizationId: string,
    contractId: string,
  ): Promise<Contract | null> {
    const rows = await selectWithPlan(executor)
      .where(and(eq(contracts.organizationId, organizationId), eq(contracts.id, contractId)))
      .limit(1);
    const row = rows[0];
    return row === undefined ? null : toContract(row.contract, row.planName);
  }

  return {
    async list(organizationId, query) {
      const conditions: SQL[] = [eq(contracts.organizationId, organizationId)];
      if (query.clientId !== undefined) {
        conditions.push(eq(contracts.portfolioClientId, query.clientId));
      }
      if (query.status !== undefined) conditions.push(eq(contracts.status, query.status));
      const where = and(...conditions);
      const sortColumn = CONTRACT_SORT_COLUMNS[query.sort];
      // Nulos (sem data de término) sempre no fim, em qualquer direção.
      const primary = query.order === 'desc' ? sql`${sortColumn} desc nulls last` : asc(sortColumn);

      const [rows, totals] = await Promise.all([
        selectWithPlan(getDb())
          .where(where)
          .orderBy(primary, desc(contracts.createdAt))
          .limit(query.pageSize)
          .offset((query.page - 1) * query.pageSize),
        getDb().select({ total: count() }).from(contracts).where(where),
      ]);
      return {
        items: rows.map((row) => toContract(row.contract, row.planName)),
        page: query.page,
        pageSize: query.pageSize,
        total: totals[0]?.total ?? 0,
      };
    },

    async findById(organizationId, contractId) {
      return findByIdWith(getDb(), organizationId, contractId);
    },

    async findActiveByClient(organizationId, clientId) {
      const rows = await selectWithPlan(getDb())
        .where(
          and(
            eq(contracts.organizationId, organizationId),
            eq(contracts.portfolioClientId, clientId),
            eq(contracts.status, 'active'),
          ),
        )
        .limit(1);
      const row = rows[0];
      return row === undefined ? null : toContract(row.contract, row.planName);
    },

    async createActivating(organizationId, input) {
      const status = input.status ?? 'active';
      return getDb().transaction(async (tx) => {
        if (status === 'active') {
          await endActiveContracts(tx, organizationId, input.portfolioClientId, input.startDate);
        }
        const inserted = await tx
          .insert(contracts)
          .values({
            organizationId,
            portfolioClientId: input.portfolioClientId,
            planId: input.planId ?? null,
            monthlyValue: input.monthlyValue.toFixed(2),
            currency: input.currency ?? 'BRL',
            startDate: input.startDate,
            endDate: input.endDate ?? null,
            status,
            contractedSlaHours: input.contractedSlaHours ?? null,
          })
          .returning();
        const row = inserted[0];
        if (row === undefined) throw new Error('Falha ao criar o contrato.');
        const created = await findByIdWith(tx, organizationId, row.id);
        if (created === null) throw new Error('Falha ao ler o contrato criado.');
        return created;
      });
    },

    async updateActivating(organizationId, contractId, patch) {
      return getDb().transaction(async (tx) => {
        const current = await findByIdWith(tx, organizationId, contractId);
        if (current === null) return null;

        const values: Partial<typeof contracts.$inferInsert> = { updatedAt: new Date() };
        if (patch.planId !== undefined) values.planId = patch.planId;
        if (patch.monthlyValue !== undefined) values.monthlyValue = patch.monthlyValue.toFixed(2);
        if (patch.currency !== undefined) values.currency = patch.currency;
        if (patch.startDate !== undefined) values.startDate = patch.startDate;
        if (patch.endDate !== undefined) values.endDate = patch.endDate;
        if (patch.status !== undefined) values.status = patch.status;
        if (patch.contractedSlaHours !== undefined) {
          values.contractedSlaHours = patch.contractedSlaHours;
        }

        if (patch.status === 'active' && current.status !== 'active') {
          await endActiveContracts(
            tx,
            organizationId,
            current.portfolioClientId,
            patch.startDate ?? current.startDate,
            contractId,
          );
        }

        await tx
          .update(contracts)
          .set(values)
          .where(and(eq(contracts.organizationId, organizationId), eq(contracts.id, contractId)));
        return findByIdWith(tx, organizationId, contractId);
      });
    },
  };
}
