/**
 * Chamadas e hooks (TanStack Query) das configurações (§4, §5, §37 Organizations).
 *
 * - usuários da organização: GET/POST /organizations/current/users e, por usuário,
 *   PATCH/DELETE /organizations/current/users/:authUserId;
 * - dados da organização: GET/PATCH /organizations/current;
 * - uso dos planos: a API de planos devolve só nome e descrição, então o quanto cada plano é
 *   usado é somado aqui a partir de /contracts (um cliente conta uma vez, pelo contrato mais
 *   recente dele naquele plano). Os números vêm da API, nunca de uma tabela fixa na tela.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import type { OrganizationRole } from '@inovaapss/shared';

import { ME_QUERY_KEY, type Organization } from '@/features/auth/api';
import { apiFetch } from '@/lib/api';

import type { Contract } from '@/features/contracts/api';

export type { Organization };

/** Vínculo usuário ↔ organização (§36 organization_users), como a API devolve. */
export interface OrganizationMember {
  id: string;
  organizationId: string;
  authUserId: string;
  email: string | null;
  role: OrganizationRole;
  createdAt: string;
}

export const settingsKeys = {
  members: ['organization', 'members'] as const,
  organization: ['organization', 'current'] as const,
  planUsage: ['plans', 'usage'] as const,
};

// ---------- usuários ----------

export function fetchMembers(): Promise<{ items: OrganizationMember[]; total: number }> {
  return apiFetch<{ items: OrganizationMember[]; total: number }>(
    '/api/v1/organizations/current/users',
  );
}

export function inviteMember(input: {
  email: string;
  role: OrganizationRole;
}): Promise<{ member: OrganizationMember }> {
  return apiFetch<{ member: OrganizationMember }>('/api/v1/organizations/current/users', {
    method: 'POST',
    json: input,
  });
}

export function updateMemberRole(
  authUserId: string,
  role: OrganizationRole,
): Promise<{ member: OrganizationMember }> {
  return apiFetch<{ member: OrganizationMember }>(
    `/api/v1/organizations/current/users/${authUserId}`,
    { method: 'PATCH', json: { role } },
  );
}

export function removeMember(authUserId: string): Promise<void> {
  return apiFetch<void>(`/api/v1/organizations/current/users/${authUserId}`, { method: 'DELETE' });
}

export function useMembers() {
  return useQuery({
    queryKey: settingsKeys.members,
    queryFn: fetchMembers,
    select: (data) => data.items,
  });
}

function useInvalidateMembers() {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: settingsKeys.members });
}

/** Resultado de um e-mail dentro de um convite em lote: a tela mostra linha a linha. */
export interface InviteOutcome {
  email: string;
  ok: boolean;
  message: string;
}

/**
 * Quebra a caixa de e-mails: um por linha, ou separados por vírgula/ponto e vírgula.
 * Tudo em minúsculas e sem repetidos, preservando a ordem em que a pessoa digitou.
 */
export function parseEmails(raw: string): string[] {
  const found = raw
    .split(/[\s,;]+/)
    .map((value) => value.trim().toLowerCase())
    .filter((value) => value !== '');
  return [...new Set(found)];
}

/** Formato de e-mail aceito antes de gastar uma requisição (a API valida de novo). */
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export function isValidEmail(email: string): boolean {
  return EMAIL_PATTERN.test(email);
}

/**
 * Convida vários e-mails de uma vez. Um convite por requisição, em sequência (a API convida um
 * por vez), e cada resposta vira uma linha de resultado — um e-mail recusado não derruba os
 * outros.
 */
export function useInviteMembers() {
  const invalidate = useInvalidateMembers();
  return useMutation({
    mutationFn: async ({
      emails,
      role,
    }: {
      emails: string[];
      role: OrganizationRole;
    }): Promise<InviteOutcome[]> => {
      const outcomes: InviteOutcome[] = [];
      for (const email of emails) {
        if (!isValidEmail(email)) {
          outcomes.push({ email, ok: false, message: 'E-mail inválido.' });
          continue;
        }
        try {
          await inviteMember({ email, role });
          outcomes.push({ email, ok: true, message: `Convidado como ${role}.` });
        } catch (error) {
          outcomes.push({
            email,
            ok: false,
            // ApiError herda de Error: a mensagem já vem pronta em português da API.
            message:
              error instanceof Error ? error.message : 'Não foi possível convidar este e-mail.',
          });
        }
      }
      return outcomes;
    },
    onSuccess: invalidate,
  });
}

export function useUpdateMemberRole() {
  const invalidate = useInvalidateMembers();
  return useMutation({
    mutationFn: ({ authUserId, role }: { authUserId: string; role: OrganizationRole }) =>
      updateMemberRole(authUserId, role),
    onSuccess: invalidate,
  });
}

export function useRemoveMember() {
  const invalidate = useInvalidateMembers();
  return useMutation({
    mutationFn: ({ authUserId }: { authUserId: string }) => removeMember(authUserId),
    onSuccess: invalidate,
  });
}

// ---------- organização ----------

export interface OrganizationWithRole {
  organization: Organization;
  role: OrganizationRole;
}

export function fetchCurrentOrganization(): Promise<OrganizationWithRole> {
  return apiFetch<OrganizationWithRole>('/api/v1/organizations/current');
}

export function updateCurrentOrganization(input: {
  name?: string;
  slug?: string;
}): Promise<OrganizationWithRole> {
  return apiFetch<OrganizationWithRole>('/api/v1/organizations/current', {
    method: 'PATCH',
    json: input,
  });
}

export function useCurrentOrganization() {
  return useQuery({ queryKey: settingsKeys.organization, queryFn: fetchCurrentOrganization });
}

export function useUpdateOrganization() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: updateCurrentOrganization,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: settingsKeys.organization });
      // O nome e o identificador aparecem no cabeçalho, que lê o GET /me.
      await queryClient.invalidateQueries({ queryKey: ME_QUERY_KEY });
    },
  });
}

// ---------- uso dos planos ----------

/** Quanto um plano é usado hoje: clientes distintos, valor mensal médio e SLA mais frequente. */
export interface PlanUsage {
  clients: number;
  averageMonthlyValue: number;
  /** Horas de SLA que mais aparecem nos contratos do plano; null quando nenhum contrato informa. */
  slaHours: number | null;
}

const CONTRACTS_PAGE_SIZE = 100;
/** Trava de segurança: 200 páginas = 20 mil contratos, muito acima de qualquer carteira real. */
const MAX_CONTRACT_PAGES = 200;

export async function fetchAllContracts(): Promise<Contract[]> {
  const all: Contract[] = [];
  for (let page = 1; page <= MAX_CONTRACT_PAGES; page += 1) {
    const params = new URLSearchParams({
      page: String(page),
      pageSize: String(CONTRACTS_PAGE_SIZE),
    });
    const result = await apiFetch<{ items: Contract[]; total: number }>(
      `/api/v1/contracts?${params}`,
    );
    all.push(...result.items);
    if (result.items.length === 0 || all.length >= result.total) break;
  }
  return all;
}

/**
 * Uso por plano, indexado pelo id do plano. Um cliente conta uma vez por plano, pelo contrato
 * de início mais recente — quem renovou o mesmo plano não vira dois clientes.
 */
export function summarizePlanUsage(contracts: Contract[]): Record<string, PlanUsage> {
  const porPlano = new Map<string, Map<string, Contract>>();
  for (const contract of contracts) {
    if (contract.planId === null) continue;
    const porCliente = porPlano.get(contract.planId) ?? new Map<string, Contract>();
    const atual = porCliente.get(contract.portfolioClientId);
    if (atual === undefined || contract.startDate > atual.startDate) {
      porCliente.set(contract.portfolioClientId, contract);
    }
    porPlano.set(contract.planId, porCliente);
  }

  const usage: Record<string, PlanUsage> = {};
  for (const [planId, porCliente] of porPlano) {
    const escolhidos = [...porCliente.values()];
    const valores = escolhidos.map((contract) => contract.monthlyValue);
    const total = valores.reduce((soma, valor) => soma + valor, 0);
    usage[planId] = {
      clients: porCliente.size,
      averageMonthlyValue: valores.length === 0 ? 0 : Math.round(total / valores.length),
      slaHours: mostFrequentSla(escolhidos),
    };
  }
  return usage;
}

/** O SLA que mais se repete nos contratos do plano (empate: o menor, o mais exigente). */
function mostFrequentSla(contracts: Contract[]): number | null {
  const contagem = new Map<number, number>();
  for (const contract of contracts) {
    if (contract.contractedSlaHours === null) continue;
    contagem.set(contract.contractedSlaHours, (contagem.get(contract.contractedSlaHours) ?? 0) + 1);
  }
  let escolhido: number | null = null;
  let maior = 0;
  for (const [horas, vezes] of [...contagem.entries()].sort((a, b) => a[0] - b[0])) {
    if (vezes > maior) {
      maior = vezes;
      escolhido = horas;
    }
  }
  return escolhido;
}

export function usePlanUsage() {
  return useQuery({
    queryKey: settingsKeys.planUsage,
    queryFn: fetchAllContracts,
    select: summarizePlanUsage,
    staleTime: 60_000,
  });
}
