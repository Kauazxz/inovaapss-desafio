/**
 * Schemas Zod de plans e contracts (§36, §37 Contracts / Plans).
 *
 * Regra de negócio central (docs/CLIENTS.md): um cliente tem no máximo UM contrato `active`
 * por vez — criar ou reativar um encerra o anterior. A regra é aplicada no service da API;
 * aqui ficam só as validações de formato.
 */
import { z } from 'zod';

import { paginationQuerySchema, uuidSchema } from '../common.js';
import { CONTRACT_SORT_FIELDS, CONTRACT_STATUSES, DEFAULT_CURRENCY } from './constants.js';

export const contractStatusSchema = z.enum(CONTRACT_STATUSES, { error: 'Status inválido.' });

// ---------- Planos ----------

export const planNameSchema = z
  .string({ error: 'Informe o nome do plano.' })
  .trim()
  .min(2, 'O nome do plano precisa ter pelo menos 2 caracteres.')
  .max(80, 'O nome do plano pode ter no máximo 80 caracteres.');

const planDescriptionSchema = z
  .string()
  .trim()
  .max(500, 'A descrição pode ter no máximo 500 caracteres.')
  .transform((value) => (value === '' ? null : value))
  .nullable()
  .optional();

export const createPlanSchema = z.object({
  name: planNameSchema,
  description: planDescriptionSchema,
});
export type CreatePlanInput = z.input<typeof createPlanSchema>;
export type CreatePlanBody = z.output<typeof createPlanSchema>;

export const updatePlanSchema = z
  .object({
    name: planNameSchema.optional(),
    description: planDescriptionSchema,
  })
  .refine((body) => body.name !== undefined || body.description !== undefined, {
    message: 'Informe ao menos um campo para atualizar (name ou description).',
  });
export type UpdatePlanInput = z.input<typeof updatePlanSchema>;
export type UpdatePlanBody = z.output<typeof updatePlanSchema>;

/** Formulário do web (criar/editar plano). */
export const planFormSchema = z.object({
  name: planNameSchema,
  description: z.string().trim().max(500, 'A descrição pode ter no máximo 500 caracteres.'),
});
export type PlanFormValues = z.infer<typeof planFormSchema>;

// ---------- Contratos ----------

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** Data civil no formato ISO `YYYY-MM-DD` (coluna `date` do Postgres). */
export const isoDateSchema = z
  .string({ error: 'Informe a data.' })
  .trim()
  .regex(ISO_DATE, 'Use a data no formato AAAA-MM-DD.')
  .refine((value) => !Number.isNaN(Date.parse(`${value}T00:00:00Z`)), 'Data inválida.');

/** Valor mensal com no máximo 2 casas decimais (coluna numeric(12,2)). */
export const monthlyValueSchema = z
  .number({ error: 'Informe o valor mensal.' })
  .min(0, 'O valor mensal não pode ser negativo.')
  .max(9_999_999_999.99, 'Valor mensal acima do limite.')
  .refine((value) => Math.abs(value * 100 - Math.round(value * 100)) < 1e-6, {
    message: 'Use no máximo 2 casas decimais.',
  });

export const currencySchema = z
  .string({ error: 'Informe a moeda.' })
  .trim()
  .toUpperCase()
  .regex(/^[A-Z]{3}$/, 'A moeda usa o código de 3 letras (ex.: BRL).');

export const contractedSlaHoursSchema = z
  .number({ error: 'Informe o SLA contratado em horas.' })
  .int('O SLA contratado precisa ser um número inteiro de horas.')
  .min(1, 'O SLA contratado precisa ser de pelo menos 1 hora.')
  .max(8760, 'O SLA contratado não pode passar de 8760 horas (1 ano).');

const END_AFTER_START = {
  path: ['endDate'],
  message: 'A data de término não pode ser anterior à de início.',
};

function endAfterStart(body: {
  startDate?: string | undefined;
  endDate?: string | null | undefined;
}): boolean {
  if (body.endDate === undefined || body.endDate === null || body.startDate === undefined) {
    return true;
  }
  return body.endDate >= body.startDate;
}

export const createContractSchema = z
  .object({
    portfolioClientId: uuidSchema,
    planId: uuidSchema.nullable().optional(),
    monthlyValue: monthlyValueSchema,
    currency: currencySchema.default(DEFAULT_CURRENCY),
    startDate: isoDateSchema,
    endDate: isoDateSchema.nullable().optional(),
    status: contractStatusSchema.default('active'),
    /** SLA contratual em horas (coluna `sla_contratado_h` da planilha). A Etapa 5 refina em políticas. */
    contractedSlaHours: contractedSlaHoursSchema.nullable().optional(),
  })
  .refine(endAfterStart, END_AFTER_START);
export type CreateContractInput = z.input<typeof createContractSchema>;
export type CreateContractBody = z.output<typeof createContractSchema>;

export const updateContractSchema = z
  .object({
    planId: uuidSchema.nullable().optional(),
    monthlyValue: monthlyValueSchema.optional(),
    currency: currencySchema.optional(),
    startDate: isoDateSchema.optional(),
    endDate: isoDateSchema.nullable().optional(),
    status: contractStatusSchema.optional(),
    contractedSlaHours: contractedSlaHoursSchema.nullable().optional(),
  })
  .refine((body) => Object.values(body).some((value) => value !== undefined), {
    message: 'Informe ao menos um campo para atualizar.',
  })
  .refine(endAfterStart, END_AFTER_START);
export type UpdateContractInput = z.input<typeof updateContractSchema>;
export type UpdateContractBody = z.output<typeof updateContractSchema>;

/**
 * Formulário do web (novo contrato de um cliente). Campos numéricos chegam como número e, em
 * branco, como undefined (`setValueAs`): o SLA em branco é permitido, o valor mensal não.
 */
export const contractFormSchema = z
  .object({
    planId: z.string(),
    monthlyValue: monthlyValueSchema,
    currency: currencySchema,
    startDate: isoDateSchema,
    endDate: z.string().trim(),
    contractedSlaHours: contractedSlaHoursSchema.optional(),
  })
  .refine((values) => values.endDate === '' || ISO_DATE.test(values.endDate), {
    path: ['endDate'],
    message: 'Use a data no formato AAAA-MM-DD.',
  })
  .refine((values) => values.endDate === '' || values.endDate >= values.startDate, END_AFTER_START);
export type ContractFormValues = z.infer<typeof contractFormSchema>;

/** Query de GET /contracts: por cliente e/ou status, com paginação §61. */
export const listContractsQuerySchema = paginationQuerySchema.extend({
  sort: z
    .enum(CONTRACT_SORT_FIELDS, { error: 'Campo de ordenação inválido.' })
    .default('startDate'),
  order: paginationQuerySchema.shape.order.default('desc'),
  clientId: uuidSchema.optional(),
  status: contractStatusSchema.optional(),
});
export type ListContractsQuery = z.output<typeof listContractsQuerySchema>;
export type ListContractsQueryInput = z.input<typeof listContractsQuerySchema>;
