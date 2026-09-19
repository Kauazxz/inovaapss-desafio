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
  /** Com senha: cria o usuário já confirmado. Sem senha: envia convite por e-mail. */
  password?: string | undefined;
}

export interface InviteMemberResult {
  member: OrganizationMember;
  /** 'invited' = e-mail de convite enviado; 'created' = criado com senha; 'linked' = já existia no Auth. */
  outcome: 'invited' | 'created' | 'linked';
}
