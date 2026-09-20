/**
 * Persistência de portfolio_clients (Drizzle).
 *
 * Toda consulta recebe o organization_id do tenant e filtra por ele (§5). A lista e o detalhe
 * trazem o contrato `active` e o plano num único select (left join), porque o filtro `plan` e
 * a ordenação por valor mensal / plano precisam acontecer no banco para a paginação bater.
 */
import { and, asc, count, eq, ilike, isNotNull, ne, or, sql, type SQL } from 'drizzle-orm';

import type { ClientSortField, PortfolioClientStatus } from '@inovaapss/validation';

import { contracts, plans, portfolioClients } from '../../db/schema/index.js';

import type {
  ClientFilterOptions,
  CreatePortfolioClientInput,
  ListClientsQuery,
  PaginatedResult,
  PortfolioClient,
  PortfolioClientWithContract,
  UpdatePortfolioClientInput,
} from './types.js';
import type { Database } from '../../infrastructure/db/index.js';
import type { PgColumn } from 'drizzle-orm/pg-core';

export interface PortfolioClientsRepository {
  list(
    organizationId: string,
    query: ListClientsQuery,
  ): Promise<PaginatedResult<PortfolioClientWithContract>>;
  findById(organizationId: string, clientId: string): Promise<PortfolioClientWithContract | null>;
  findByExternalCode(organizationId: string, externalCode: string): Promise<PortfolioClient | null>;
  create(organizationId: string, input: CreatePortfolioClientInput): Promise<PortfolioClient>;
  update(
    organizationId: string,
    clientId: string,
    patch: UpdatePortfolioClientInput,
  ): Promise<PortfolioClient | null>;
  filterOptions(organizationId: string): Promise<ClientFilterOptions>;
}

type ClientRow = typeof portfolioClients.$inferSelect;
type ContractRow = typeof contracts.$inferSelect;

export function toPortfolioClient(row: ClientRow): PortfolioClient {
  return {
    id: row.id,
    organizationId: row.organizationId,
    externalCode: row.externalCode,
    name: row.name,
    segment: row.segment,
    size: row.size,
    status: row.status,
    strategicImportance: row.strategicImportance,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function withContract(
  client: ClientRow,
  contract: ContractRow | null,
  planName: string | null,
): PortfolioClientWithContract {
  return {
    ...toPortfolioClient(client),
    activeContract:
      contract === null
        ? null
        : {
            id: contract.id,
            planId: contract.planId,
            planName,
            monthlyValue: Number(contract.monthlyValue),
            currency: contract.currency,
            startDate: contract.startDate,
            endDate: contract.endDate,
            status: contract.status,
            contractedSlaHours: contract.contractedSlaHours,
          },
  };
}

/** `%` e `_` são curingas do ILIKE: escapados para a busca ser literal. */
function likePattern(search: string): string {
  return `%${search.replace(/[\\%_]/g, (char) => `\\${char}`)}%`;
}

const SORT_COLUMNS: Record<ClientSortField, PgColumn | SQL> = {
  name: portfolioClients.name,
  externalCode: portfolioClients.externalCode,
  segment: portfolioClients.segment,
  size: portfolioClients.size,
  status: portfolioClients.status,
  strategicImportance: portfolioClients.strategicImportance,
  planName: plans.name,
  monthlyValue: contracts.monthlyValue,
  createdAt: portfolioClients.createdAt,
};

const activeContractJoin = and(
  eq(contracts.portfolioClientId, portfolioClients.id),
  eq(contracts.status, 'active'),
);

export function createPortfolioClientsRepository(
  getDb: () => Database,
): PortfolioClientsRepository {
  const baseSelect = () =>
    getDb()
      .select({ client: portfolioClients, contract: contracts, planName: plans.name })
      .from(portfolioClients)
      .leftJoin(contracts, activeContractJoin)
      .leftJoin(plans, eq(plans.id, contracts.planId));

  return {
    async list(organizationId, query) {
      const conditions: SQL[] = [eq(portfolioClients.organizationId, organizationId)];
      if (query.status !== undefined) {
        conditions.push(eq(portfolioClients.status, query.status));
      } else {
        conditions.push(ne(portfolioClients.status, 'archived'));
      }
      if (query.segment !== undefined) conditions.push(eq(portfolioClients.segment, query.segment));
      if (query.size !== undefined) conditions.push(eq(portfolioClients.size, query.size));
      if (query.strategic_importance !== undefined) {
        conditions.push(eq(portfolioClients.strategicImportance, query.strategic_importance));
      }
      if (query.plan !== undefined) conditions.push(eq(plans.name, query.plan));
      if (query.search !== undefined && query.search !== '') {
        const pattern = likePattern(query.search);
        const bySearch = or(
          ilike(portfolioClients.name, pattern),
          ilike(portfolioClients.externalCode, pattern),
        );
        if (bySearch !== undefined) conditions.push(bySearch);
      }
      const where = and(...conditions);

      // Nulos (sem contrato, sem segmento...) sempre no fim, em qualquer direção.
      const direction = (column: PgColumn | SQL) =>
        query.order === 'desc' ? sql`${column} desc nulls last` : asc(column);
      const sortColumn = SORT_COLUMNS[query.sort];
      const orderBy =
        query.sort === 'name'
          ? [direction(portfolioClients.name), asc(portfolioClients.id)]
          : [direction(sortColumn), asc(portfolioClients.name), asc(portfolioClients.id)];

      const [rows, totals] = await Promise.all([
        baseSelect()
          .where(where)
          .orderBy(...orderBy)
          .limit(query.pageSize)
          .offset((query.page - 1) * query.pageSize),
        getDb()
          .select({ total: count() })
          .from(portfolioClients)
          .leftJoin(contracts, activeContractJoin)
          .leftJoin(plans, eq(plans.id, contracts.planId))
          .where(where),
      ]);

      return {
        items: rows.map((row) => withContract(row.client, row.contract, row.planName)),
        page: query.page,
        pageSize: query.pageSize,
        total: totals[0]?.total ?? 0,
      };
    },

    async findById(organizationId, clientId) {
      const rows = await baseSelect()
        .where(
          and(
            eq(portfolioClients.organizationId, organizationId),
            eq(portfolioClients.id, clientId),
          ),
        )
        .limit(1);
      const row = rows[0];
      return row === undefined ? null : withContract(row.client, row.contract, row.planName);
    },

    async findByExternalCode(organizationId, externalCode) {
      const rows = await getDb()
        .select()
        .from(portfolioClients)
        .where(
          and(
            eq(portfolioClients.organizationId, organizationId),
            eq(portfolioClients.externalCode, externalCode),
          ),
        )
        .limit(1);
      const row = rows[0];
      return row === undefined ? null : toPortfolioClient(row);
    },

    async create(organizationId, input) {
      const rows = await getDb()
        .insert(portfolioClients)
        .values({
          organizationId,
          name: input.name,
          externalCode: input.externalCode ?? null,
          segment: input.segment ?? null,
          size: input.size ?? null,
          status: input.status ?? 'active',
          strategicImportance: input.strategicImportance ?? 3,
        })
        .returning();
      const row = rows[0];
      if (row === undefined) throw new Error('Falha ao criar o cliente.');
      return toPortfolioClient(row);
    },

    async update(organizationId, clientId, patch) {
      const values: Partial<typeof portfolioClients.$inferInsert> = { updatedAt: new Date() };
      if (patch.name !== undefined) values.name = patch.name;
      if (patch.externalCode !== undefined) values.externalCode = patch.externalCode;
      if (patch.segment !== undefined) values.segment = patch.segment;
      if (patch.size !== undefined) values.size = patch.size;
      if (patch.status !== undefined) values.status = patch.status;
      if (patch.strategicImportance !== undefined) {
        values.strategicImportance = patch.strategicImportance;
      }
      const rows = await getDb()
        .update(portfolioClients)
        .set(values)
        .where(
          and(
            eq(portfolioClients.organizationId, organizationId),
            eq(portfolioClients.id, clientId),
          ),
        )
        .returning();
      const row = rows[0];
      return row === undefined ? null : toPortfolioClient(row);
    },

    async filterOptions(organizationId) {
      const db = getDb();
      const [segments, sizes, planNames, statuses] = await Promise.all([
        db
          .selectDistinct({ value: portfolioClients.segment })
          .from(portfolioClients)
          .where(
            and(
              eq(portfolioClients.organizationId, organizationId),
              isNotNull(portfolioClients.segment),
            ),
          )
          .orderBy(asc(portfolioClients.segment)),
        db
          .selectDistinct({ value: portfolioClients.size })
          .from(portfolioClients)
          .where(
            and(
              eq(portfolioClients.organizationId, organizationId),
              isNotNull(portfolioClients.size),
            ),
          )
          .orderBy(asc(portfolioClients.size)),
        db
          .select({ value: plans.name })
          .from(plans)
          .where(eq(plans.organizationId, organizationId))
          .orderBy(asc(plans.name)),
        db
          .selectDistinct({ value: portfolioClients.status })
          .from(portfolioClients)
          .where(eq(portfolioClients.organizationId, organizationId))
          .orderBy(asc(sql`${portfolioClients.status}::text`)),
      ]);
      const values = (rows: { value: string | null }[]): string[] =>
        rows.flatMap((row) => (row.value === null ? [] : [row.value]));
      return {
        segments: values(segments),
        sizes: values(sizes),
        plans: values(planNames),
        statuses: statuses.map((row) => row.value as PortfolioClientStatus),
      };
    },
  };
}
