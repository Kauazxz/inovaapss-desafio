/**
 * Um contrato por cliente nas leituras que somam dinheiro ou contam clientes.
 *
 * `contracts` guarda o histórico: o índice parcial só garante UM contrato `active` por cliente,
 * nada impede vários `ended` (é o que acontece quando alguém encerra um contrato e cria outro,
 * fluxo que a própria tela de contratos oferece). Um `leftJoin` direto em `contracts` devolve
 * então N linhas do mesmo cliente, e quem lê isso passa a contar o cliente N vezes e a somar o
 * MRR N vezes — no dashboard, nos alertas e no recálculo.
 *
 * Este subquery resolve o cliente em exatamente uma linha, escolhendo:
 *   1. o contrato `active` (é o que está valendo e é o que a tela de clientes já mostra); ou
 *   2. na falta dele — cliente cancelado —, o encerrado mais recente.
 *
 * Quem quer "o contrato vigente" (MRR de hoje) checa `status === 'active'` na linha devolvida;
 * quem quer o último contrato conhecido (histórico do cancelado) usa a linha como está.
 */
import { desc, eq, sql } from 'drizzle-orm';

import { contracts } from '../db/schema/index.js';

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- o tipo do Drizzle varia com o schema
type Database = any;

/**
 * Subquery `current_contract` com uma linha por `portfolio_client_id`.
 * Use com `leftJoin(currentContract, eq(currentContract.portfolioClientId, portfolioClients.id))`.
 */
export function currentContractSubquery(db: Database, organizationId: string) {
  return db
    .selectDistinctOn([contracts.portfolioClientId], {
      portfolioClientId: contracts.portfolioClientId,
      contractId: contracts.id,
      planId: contracts.planId,
      monthlyValue: contracts.monthlyValue,
      currency: contracts.currency,
      startDate: contracts.startDate,
      endDate: contracts.endDate,
      status: contracts.status,
      contractedSlaHours: contracts.contractedSlaHours,
    })
    .from(contracts)
    .where(eq(contracts.organizationId, organizationId))
    .orderBy(
      contracts.portfolioClientId,
      // `active` primeiro; depois o mais recente pela data de início e, no empate, pela criação.
      sql`(${contracts.status} = 'active') desc`,
      desc(contracts.startDate),
      desc(contracts.createdAt),
    )
    .as('current_contract');
}
