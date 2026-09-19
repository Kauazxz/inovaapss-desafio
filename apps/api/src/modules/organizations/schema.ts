/**
 * Schemas Zod das rotas de organizações (§37). `slugSchema` e `organizationRoleSchema` vêm de
 * @inovaapss/validation, os mesmos que o front usa no formulário de onboarding.
 */
import { z } from 'zod';

import { organizationRoleSchema, slugSchema } from '@inovaapss/validation';

export const organizationNameSchema = z
  .string()
  .trim()
  .min(2, 'O nome precisa ter pelo menos 2 caracteres.')
  .max(120, 'O nome pode ter no máximo 120 caracteres.');

export const createOrganizationSchema = z.object({
  name: organizationNameSchema,
  slug: slugSchema,
});
export type CreateOrganizationBody = z.infer<typeof createOrganizationSchema>;

export const updateOrganizationSchema = z
  .object({
    name: organizationNameSchema.optional(),
    slug: slugSchema.optional(),
  })
  .refine((body) => body.name !== undefined || body.slug !== undefined, {
    message: 'Informe ao menos um campo para atualizar (name ou slug).',
  });
export type UpdateOrganizationBody = z.infer<typeof updateOrganizationSchema>;

export const inviteMemberSchema = z.object({
  email: z.email('Informe um e-mail válido.').trim().toLowerCase(),
  role: organizationRoleSchema.default('viewer'),
  password: z
    .string()
    .min(8, 'A senha temporária precisa ter pelo menos 8 caracteres.')
    .max(72, 'A senha pode ter no máximo 72 caracteres.')
    .optional(),
});
export type InviteMemberBody = z.infer<typeof inviteMemberSchema>;
