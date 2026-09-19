/** Chamadas da API usadas pela feature de auth (§37 Session e Organization). */
import type { OrganizationRole } from '@inovaapss/shared';

import { apiFetch } from '@/lib/api';

export interface Organization {
  id: string;
  name: string;
  slug: string;
  createdAt: string;
  updatedAt: string;
}

/** Resposta de GET /api/v1/me. `organization` null = usuário ainda sem organização. */
export interface Me {
  user: { id: string; email: string | null };
  organization: Organization | null;
  role: OrganizationRole | null;
}

export interface OrganizationWithRole {
  organization: Organization;
  role: OrganizationRole;
}

export const ME_QUERY_KEY = ['me'] as const;

export function fetchMe(): Promise<Me> {
  return apiFetch<Me>('/api/v1/me');
}

export function createOrganization(input: {
  name: string;
  slug: string;
}): Promise<OrganizationWithRole> {
  return apiFetch<OrganizationWithRole>('/api/v1/organizations', { method: 'POST', json: input });
}
