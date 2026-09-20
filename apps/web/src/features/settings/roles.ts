/**
 * Os quatro papéis da §4 e o que cada um pode fazer.
 *
 * A tabela de permissões não é uma promessa: ela foi escrita lendo os `requireRole` da API
 * (os `routes.ts` de cada módulo) em 20/09/2026 e é a mesma que aparece em docs/USUARIOS.md.
 * Quando um módulo novo mudar os papéis aceitos, esta tabela muda junto.
 */
import { ORGANIZATION_ROLES, type OrganizationRole } from '@inovaapss/shared';

export const ROLES: readonly OrganizationRole[] = ORGANIZATION_ROLES;

/** Uma linha por papel, do jeito que aparece na tela. */
export const ROLE_SUMMARY: Record<OrganizationRole, string> = {
  owner: 'Dona da conta: faz tudo, inclusive gerenciar usuários e transferir a posse.',
  admin: 'Gerencia a operação inteira: clientes, métricas, modelos, importações e usuários.',
  analyst:
    'Trabalha a carteira: cadastra e edita clientes e contratos, importa dados e trata alertas, mas não mexe em usuários nem ativa versão de modelo.',
  viewer: 'Só leitura: vê o painel, os clientes e os alertas, e não altera nada.',
};

export interface PermissionRow {
  /** O que a pessoa quer fazer, em linguagem de produto. */
  action: string;
  /** Quais papéis a API aceita hoje nesta ação. */
  allowed: readonly OrganizationRole[];
  /** Onde isso é exigido, para quem for conferir no código. */
  enforcedBy: string;
}

const ALL_ROLES: readonly OrganizationRole[] = ['owner', 'admin', 'analyst', 'viewer'];
const WRITERS: readonly OrganizationRole[] = ['owner', 'admin', 'analyst'];
const MANAGERS: readonly OrganizationRole[] = ['owner', 'admin'];

export const PERMISSION_MATRIX: readonly PermissionRow[] = [
  {
    action: 'Ver o painel e os clientes',
    allowed: ALL_ROLES,
    enforcedBy: 'GET /dashboard e GET /clients exigem só o vínculo com a organização',
  },
  {
    action: 'Tratar alertas',
    allowed: WRITERS,
    enforcedBy: 'PATCH /alerts/:id',
  },
  {
    action: 'Editar clientes e contratos',
    allowed: WRITERS,
    enforcedBy: 'POST/PATCH/DELETE de /clients, /contracts e /plans',
  },
  {
    action: 'Importar dados',
    allowed: WRITERS,
    enforcedBy: 'POST /documents e a extração de métricas',
  },
  {
    action: 'Editar métricas e ativar versão do modelo',
    allowed: MANAGERS,
    enforcedBy: 'POST/PATCH/DELETE de /metrics e /metric-models',
  },
  {
    action: 'Gerenciar usuários',
    allowed: MANAGERS,
    enforcedBy: 'POST/PATCH/DELETE de /organizations/current/users (só o owner nomeia outro owner)',
  },
];

export function roleAllows(row: PermissionRow, role: OrganizationRole): boolean {
  return row.allowed.includes(role);
}

/** Papéis que podem gerenciar usuários e editar a organização. */
export function isManager(role: OrganizationRole | null | undefined): boolean {
  return role === 'owner' || role === 'admin';
}
