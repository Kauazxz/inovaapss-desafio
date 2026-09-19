import { z } from 'zod';

/** Identificador UUID (todas as chaves primárias do banco). */
export const uuidSchema = z.uuid({ message: 'Identificador inválido.' });

/** Slug: minúsculas, números e hífens, sem começar nem terminar com hífen (§36 organizations.slug). */
export const slugSchema = z
  .string()
  .trim()
  .min(2, 'O slug precisa ter pelo menos 2 caracteres.')
  .max(64, 'O slug pode ter no máximo 64 caracteres.')
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Use apenas letras minúsculas, números e hífens.');

export const SORT_ORDERS = ['asc', 'desc'] as const;
export type SortOrder = (typeof SORT_ORDERS)[number];

export const PAGINATION_DEFAULT_PAGE_SIZE = 20;
export const PAGINATION_MAX_PAGE_SIZE = 100;

/**
 * §61 — query string padrão das listagens: page, pageSize, search, sort, order.
 * Filtros específicos (health_class, plan, ...) são adicionados por cada rota com `.extend()`.
 */
export const paginationQuerySchema = z.object({
  page: z.coerce.number().int().min(1, 'A página começa em 1.').default(1),
  pageSize: z.coerce
    .number()
    .int()
    .min(1, 'Informe ao menos 1 item por página.')
    .max(PAGINATION_MAX_PAGE_SIZE, `No máximo ${PAGINATION_MAX_PAGE_SIZE} itens por página.`)
    .default(PAGINATION_DEFAULT_PAGE_SIZE),
  search: z.string().trim().max(200, 'A busca pode ter no máximo 200 caracteres.').optional(),
  sort: z
    .string()
    .trim()
    .regex(/^[a-zA-Z_][a-zA-Z0-9_.]*$/, 'Campo de ordenação inválido.')
    .optional(),
  order: z.enum(SORT_ORDERS).default('asc'),
});
export type PaginationQuery = z.infer<typeof paginationQuerySchema>;
export type PaginationQueryInput = z.input<typeof paginationQuerySchema>;

/** Envelope padrão de resposta paginada da API. */
export function paginatedResponseSchema<TItem extends z.ZodType>(item: TItem) {
  return z.object({
    items: z.array(item),
    page: z.number().int().min(1),
    pageSize: z.number().int().min(1),
    total: z.number().int().min(0),
  });
}
