/**
 * Schemas Zod de portfolio_clients (§36, §37 Clients, §61). Usados pela API (rotas) e pelo
 * web (React Hook Form) — a mesma regra vale nos dois lados.
 */
import { z } from 'zod';

import { paginationQuerySchema } from '../common.js';
import {
  CLIENT_SORT_FIELDS,
  PORTFOLIO_CLIENT_STATUSES,
  STRATEGIC_IMPORTANCE_DEFAULT,
  STRATEGIC_IMPORTANCE_MAX,
  STRATEGIC_IMPORTANCE_MIN,
} from './constants.js';

export const portfolioClientStatusSchema = z.enum(PORTFOLIO_CLIENT_STATUSES, {
  error: 'Status inválido.',
});

const IMPORTANCE_RANGE = `A importância estratégica vai de ${STRATEGIC_IMPORTANCE_MIN} a ${STRATEGIC_IMPORTANCE_MAX}.`;

export const strategicImportanceSchema = z
  .number({ error: 'Informe a importância estratégica de 1 a 5.' })
  .int('A importância estratégica precisa ser um número inteiro.')
  .min(STRATEGIC_IMPORTANCE_MIN, IMPORTANCE_RANGE)
  .max(STRATEGIC_IMPORTANCE_MAX, IMPORTANCE_RANGE);

/** Texto curto opcional: string vazia vira null (formulários mandam '' em campo em branco). */
function optionalText(max: number, label: string) {
  return z
    .string()
    .trim()
    .max(max, `${label} pode ter no máximo ${max} caracteres.`)
    .transform((value) => (value === '' ? null : value))
    .nullable()
    .optional();
}

export const clientNameSchema = z
  .string({ error: 'Informe o nome do cliente.' })
  .trim()
  .min(2, 'O nome precisa ter pelo menos 2 caracteres.')
  .max(160, 'O nome pode ter no máximo 160 caracteres.');

export const createPortfolioClientSchema = z.object({
  name: clientNameSchema,
  /** Código do cliente no sistema de origem (ex.: `cliente_id` da planilha). Único por organização. */
  externalCode: optionalText(64, 'O código'),
  segment: optionalText(80, 'O segmento'),
  size: optionalText(40, 'O porte'),
  status: portfolioClientStatusSchema.default('active'),
  strategicImportance: strategicImportanceSchema.default(STRATEGIC_IMPORTANCE_DEFAULT),
});
export type CreatePortfolioClientInput = z.input<typeof createPortfolioClientSchema>;
export type CreatePortfolioClientBody = z.output<typeof createPortfolioClientSchema>;

export const updatePortfolioClientSchema = z
  .object({
    name: clientNameSchema.optional(),
    externalCode: optionalText(64, 'O código'),
    segment: optionalText(80, 'O segmento'),
    size: optionalText(40, 'O porte'),
    status: portfolioClientStatusSchema.optional(),
    strategicImportance: strategicImportanceSchema.optional(),
  })
  .refine((body) => Object.values(body).some((value) => value !== undefined), {
    message: 'Informe ao menos um campo para atualizar.',
  });
export type UpdatePortfolioClientInput = z.input<typeof updatePortfolioClientSchema>;
export type UpdatePortfolioClientBody = z.output<typeof updatePortfolioClientSchema>;

/** Formulário do web: cria e edita com o mesmo shape (campos em branco viajam como ''). */
export const portfolioClientFormSchema = z.object({
  name: clientNameSchema,
  externalCode: z.string().trim().max(64, 'O código pode ter no máximo 64 caracteres.'),
  segment: z.string().trim().max(80, 'O segmento pode ter no máximo 80 caracteres.'),
  size: z.string().trim().max(40, 'O porte pode ter no máximo 40 caracteres.'),
  status: portfolioClientStatusSchema,
  strategicImportance: strategicImportanceSchema,
});
export type PortfolioClientFormValues = z.infer<typeof portfolioClientFormSchema>;

/**
 * §61 — query da listagem: paginação padrão + filtros de clientes. `plan` filtra pelo nome do
 * plano do contrato ativo; `strategic_importance` pelo valor exato. Sem `status`, a lista
 * esconde os arquivados.
 */
export const listPortfolioClientsQuerySchema = paginationQuerySchema.extend({
  sort: z.enum(CLIENT_SORT_FIELDS, { error: 'Campo de ordenação inválido.' }).default('name'),
  status: portfolioClientStatusSchema.optional(),
  segment: z.string().trim().min(1).max(80).optional(),
  size: z.string().trim().min(1).max(40).optional(),
  plan: z.string().trim().min(1).max(80).optional(),
  strategic_importance: z.coerce
    .number()
    .int()
    .min(STRATEGIC_IMPORTANCE_MIN)
    .max(STRATEGIC_IMPORTANCE_MAX)
    .optional(),
});
export type ListPortfolioClientsQuery = z.output<typeof listPortfolioClientsQuerySchema>;
export type ListPortfolioClientsQueryInput = z.input<typeof listPortfolioClientsQuerySchema>;
