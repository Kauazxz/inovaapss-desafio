import type { OrganizationRole } from '@inovaapss/shared';

import type { Organization } from '../organizations/types.js';

/** Resposta de GET /api/v1/me (§37 Session). */
export interface MeResponse {
  user: {
    id: string;
    email: string | null;
  };
  /** null enquanto o usuário não pertence a nenhuma organização (vai para o onboarding). */
  organization: Organization | null;
  role: OrganizationRole | null;
}
