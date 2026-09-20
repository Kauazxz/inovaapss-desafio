import type { OrganizationRole } from '@inovaapss/shared';

export interface Organization {
  id: string;
  name: string;
  slug: string;
  createdAt: string;
  updatedAt: string;
}

/** Vínculo usuário ↔ organização, já com o e-mail vindo do Supabase Auth. */
export interface OrganizationMember {
  id: string;
  organizationId: string;
  authUserId: string;
  email: string | null;
  role: OrganizationRole;
  createdAt: string;
}

export interface CreateOrganizationInput {
  name: string;
  slug: string;
}

export interface UpdateOrganizationInput {
  name?: string | undefined;
  slug?: string | undefined;
}

export interface InviteMemberInput {
  email: string;
  role: OrganizationRole;
}

/**
 * Resposta do convite. Propositalmente igual exista ou não a conta no Auth: a rota nunca diz a
 * um owner/admin quais e-mails já têm conta na plataforma (enumeração entre organizações).
 */
export interface InviteMemberResult {
  member: OrganizationMember;
}

export interface UpdateMemberRoleInput {
  role: OrganizationRole;
}
