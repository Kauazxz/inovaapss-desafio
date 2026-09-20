/**
 * Schemas Zod de cada dataset. Recebem a linha JÁ coagida (`applyMapping`): aqui ficam presença
 * de obrigatórios, faixas e regras cruzadas (§21 reuniões, §22 NPS, §33 cancelamento). Mensagens
 * em português, prontas para o preview.
 */
import { z } from 'zod';

const PERIOD_RE = /^\d{4}-(0[1-9]|1[0-2])$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

const requiredText = (label: string) =>
  z
    .string({ error: `${label} é obrigatório.` })
    .trim()
    .min(1, { error: `${label} é obrigatório.` });

const optionalText = z.string().trim().min(1).nullable();

const period = (label: string) =>
  z
    .string({ error: `${label} é obrigatório.` })
    .regex(PERIOD_RE, { error: `${label} deve estar no formato AAAA-MM.` });

const nonNegativeInt = (label: string) =>
  z
    .number({ error: `${label} deve ser um número inteiro.` })
    .int({ error: `${label} deve ser um número inteiro.` })
    .min(0, { error: `${label} não pode ser negativo.` })
    .nullable();

const percentage = (label: string) =>
  z
    .number({ error: `${label} deve ser um número.` })
    .min(0, { error: `${label} deve estar entre 0 e 100.` })
    .max(100, { error: `${label} deve estar entre 0 e 100.` })
    .nullable();

export const clientRowSchema = z.object({
  external_code: requiredText('Código do cliente'),
  name: optionalText,
  segment: requiredText('Segmento'),
  size: requiredText('Porte'),
  plan: requiredText('Plano'),
  monthly_value: z
    .number({ error: 'Valor mensal é obrigatório.' })
    .min(0, { error: 'Valor mensal não pode ser negativo.' }),
  contracted_sla_hours: z
    .number({ error: 'SLA contratado é obrigatório.' })
    .gt(0, { error: 'SLA contratado deve ser maior que zero.' }),
  contract_start: z
    .string({ error: 'Início do contrato é obrigatório.' })
    .regex(DATE_RE, { error: 'Início do contrato deve ser uma data (AAAA-MM-DD).' }),
});
export type ClientRow = z.infer<typeof clientRowSchema>;

export const monthlyMetricsRowSchema = z
  .object({
    external_code: requiredText('Código do cliente'),
    period: period('Período'),
    open_tickets: nonNegativeInt('Chamados abertos'),
    critical_tickets: nonNegativeInt('Chamados críticos'),
    reopened_tickets: nonNegativeInt('Chamados reabertos'),
    tickets_within_sla: nonNegativeInt('Chamados dentro do SLA'),
    sla_compliance_pct: percentage('SLA cumprido'),
    avg_resolution_hours: z
      .number({ error: 'Tempo médio de resolução deve ser um número.' })
      .min(0, { error: 'Tempo médio de resolução não pode ser negativo.' })
      .nullable(),
    formal_complaints: nonNegativeInt('Reclamações formais'),
    platform_usage_pct: percentage('Uso da plataforma'),
    payment_delay_days: nonNegativeInt('Atraso de pagamento'),
    meetings_planned: nonNegativeInt('Reuniões previstas'),
    meetings_completed: nonNegativeInt('Reuniões realizadas'),
  })
  .superRefine((row, ctx) => {
    const open = row.open_tickets;
    if (open !== null) {
      const notAbove = (value: number | null, path: string, label: string) => {
        if (value !== null && value > open) {
          ctx.addIssue({
            code: 'custom',
            path: [path],
            params: { code: 'INCONSISTENT' },
            message: `${label} (${value}) não pode ser maior que chamados abertos (${open}).`,
          });
        }
      };
      notAbove(row.critical_tickets, 'critical_tickets', 'Chamados críticos');
      notAbove(row.reopened_tickets, 'reopened_tickets', 'Chamados reabertos');
      notAbove(row.tickets_within_sla, 'tickets_within_sla', 'Chamados dentro do SLA');
    }
    if (
      row.meetings_planned !== null &&
      row.meetings_completed !== null &&
      row.meetings_completed > row.meetings_planned
    ) {
      ctx.addIssue({
        code: 'custom',
        path: ['meetings_completed'],
        params: { code: 'INCONSISTENT' },
        message: `Reuniões realizadas (${row.meetings_completed}) não pode ser maior que previstas (${row.meetings_planned}).`,
      });
    }
  })
  .transform((row) => ({
    ...row,
    /**
     * Mês sem chamado não tem aderência a SLA: é "não se aplica" (§15 — divisor zero), e é
     * assim que a planilha do desafio vem. Um arquivo que mandasse 0 % num mês sem chamado
     * faria a métrica de cumprimento de SLA (12 % do peso) pontuar zero num mês em que nada
     * aconteceu de errado — por isso o valor é normalizado aqui, na entrada.
     */
    sla_compliance_pct: row.open_tickets === 0 ? null : row.sla_compliance_pct,
  }));
export type MonthlyMetricsRow = z.infer<typeof monthlyMetricsRowSchema>;

export const NPS_CLASSIFICATIONS = ['promoter', 'neutral', 'detractor', 'no_answer'] as const;
export type NpsClassification = (typeof NPS_CLASSIFICATIONS)[number];

/** Classificação padrão do NPS pela nota (§22): 9–10 promotor, 7–8 neutro, 0–6 detrator. */
export function classifyNps(score: number | null): NpsClassification {
  if (score === null) return 'no_answer';
  if (score >= 9) return 'promoter';
  if (score >= 7) return 'neutral';
  return 'detractor';
}

export const npsRowSchema = z
  .object({
    external_code: requiredText('Código do cliente'),
    period: period('Período'),
    answered: z.boolean({ error: 'Respondeu é obrigatório (0/1, sim/não).' }),
    score: z
      .number({ error: 'Nota deve ser um número inteiro de 0 a 10.' })
      .int({ error: 'Nota deve ser um número inteiro de 0 a 10.' })
      .min(0, { error: 'Nota deve estar entre 0 e 10.' })
      .max(10, { error: 'Nota deve estar entre 0 e 10.' })
      .nullable(),
    classification: z.enum(NPS_CLASSIFICATIONS).nullable(),
  })
  .superRefine((row, ctx) => {
    if (row.answered && row.score === null) {
      ctx.addIssue({
        code: 'custom',
        path: ['score'],
        params: { code: 'MISSING_REQUIRED' },
        message: 'Nota é obrigatória quando o cliente respondeu.',
      });
    }
    /**
     * §17 — a classificação é DERIVADA da nota, não um dado independente. Aceitar as duas
     * colunas sem confrontá-las deixaria passar um "Promotor" com nota 3, e a tela mostraria
     * um cliente satisfeito com a nota de um detrator. Melhor o arquivo ser recusado.
     */
    if (row.answered && row.score !== null && row.classification !== null) {
      const esperada = classifyNps(row.score);
      if (row.classification !== esperada) {
        ctx.addIssue({
          code: 'custom',
          path: ['classification'],
          params: { code: 'INCONSISTENT' },
          message: `Classificação "${row.classification}" não corresponde à nota ${row.score} (esperado: "${esperada}").`,
        });
      }
    }
  })
  .transform((row) => ({
    ...row,
    // Não respondeu → nota ignorada (§22: ausência de resposta é informação, não nota).
    score: row.answered ? row.score : null,
    classification: row.answered
      ? (row.classification ?? classifyNps(row.score))
      : ('no_answer' as NpsClassification),
  }));
export type NpsRow = z.infer<typeof npsRowSchema>;

export const CLIENT_STATUSES = ['active', 'cancelled'] as const;
export type ClientStatus = (typeof CLIENT_STATUSES)[number];

export const clientStatusRowSchema = z
  .object({
    external_code: requiredText('Código do cliente'),
    status: z.enum(CLIENT_STATUSES, { error: 'Situação é obrigatória (Ativo ou Cancelado).' }),
    cancellation_period: z
      .string()
      .regex(PERIOD_RE, { error: 'Mês do cancelamento deve estar no formato AAAA-MM.' })
      .nullable(),
  })
  .superRefine((row, ctx) => {
    if (row.status === 'cancelled' && row.cancellation_period === null) {
      ctx.addIssue({
        code: 'custom',
        path: ['cancellation_period'],
        params: { code: 'MISSING_REQUIRED' },
        message: 'Mês do cancelamento é obrigatório quando a situação é Cancelado.',
      });
    }
  });
export type ClientStatusRow = z.infer<typeof clientStatusRowSchema>;

export const DATASET_SCHEMAS = {
  clients: clientRowSchema,
  monthly_metrics: monthlyMetricsRowSchema,
  nps: npsRowSchema,
  client_status: clientStatusRowSchema,
} as const;

export type DatasetRowTypes = {
  clients: ClientRow;
  monthly_metrics: MonthlyMetricsRow;
  nps: NpsRow;
  client_status: ClientStatusRow;
};
