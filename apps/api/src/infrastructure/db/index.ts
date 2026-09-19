/**
 * Cliente Drizzle sobre postgres.js, criado de forma preguiçosa: a conexão só é aberta na
 * primeira chamada a `getDb()` ou `ping()`. Sem DATABASE_URL, `isConfigured` é false e
 * `getDb()` lança um erro amigável em vez de tentar conectar.
 *
 * `prepare: false` é obrigatório no "Transaction pooler" do Supabase (porta 6543), que não
 * suporta prepared statements.
 */
import { drizzle, type PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import postgres, { type Sql } from 'postgres';

import * as schema from '../../db/schema/index.js';
import { DatabaseNotConfiguredError } from '../../shared/errors.js';

export type Database = PostgresJsDatabase<typeof schema>;

export interface DbClient {
  /** true quando DATABASE_URL foi informada (não garante que a conexão funcione). */
  readonly isConfigured: boolean;
  /** Instância do Drizzle; lança DatabaseNotConfiguredError sem DATABASE_URL. */
  getDb(): Database;
  /** `select 1` com timeout; rejeita se o banco não responder a tempo. */
  ping(timeoutMs?: number): Promise<void>;
  /** Fecha o pool (usado no desligamento gracioso). */
  close(): Promise<void>;
}

interface Connection {
  sql: Sql;
  db: Database;
}

export function createDbClient(databaseUrl: string | undefined): DbClient {
  let connection: Connection | undefined;

  const connect = (): Connection => {
    if (databaseUrl === undefined) {
      throw new DatabaseNotConfiguredError();
    }
    if (connection === undefined) {
      const sql = postgres(databaseUrl, {
        prepare: false,
        max: 10,
        connect_timeout: 10,
        idle_timeout: 30,
      });
      connection = { sql, db: drizzle(sql, { schema }) };
    }
    return connection;
  };

  return {
    isConfigured: databaseUrl !== undefined,

    getDb() {
      return connect().db;
    },

    async ping(timeoutMs = 2000) {
      const { sql } = connect();
      let timer: NodeJS.Timeout | undefined;
      const timeout = new Promise<never>((_resolve, reject) => {
        timer = setTimeout(
          () => reject(new Error(`O banco não respondeu em ${timeoutMs} ms.`)),
          timeoutMs,
        );
      });
      try {
        await Promise.race([sql`select 1`, timeout]);
      } finally {
        clearTimeout(timer);
      }
    },

    async close() {
      if (connection !== undefined) {
        const { sql } = connection;
        connection = undefined;
        await sql.end({ timeout: 5 });
      }
    },
  };
}
