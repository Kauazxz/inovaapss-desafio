import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useId } from 'react';

import { Button } from '@/components/ui/button';

export interface PaginationProps {
  page: number;
  pageSize: number;
  total: number;
  onPageChange: (page: number) => void;
  onPageSizeChange: (pageSize: number) => void;
  /** Substantivo para a contagem ("clientes", "contratos"). */
  noun: string;
}

const PAGE_SIZES = [10, 20, 50];

/** Rodapé de paginação §61: contagem, tamanho da página e anterior/próxima. */
export function Pagination({
  page,
  pageSize,
  total,
  onPageChange,
  onPageSizeChange,
  noun,
}: PaginationProps) {
  const sizeId = useId();
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(total, page * pageSize);

  return (
    <nav
      aria-label="Paginação"
      className="flex flex-col gap-3 text-sm text-muted-foreground sm:flex-row sm:flex-wrap sm:items-center sm:justify-between"
    >
      <p className="tabular-nums">
        {total === 0 ? `Nenhum ${noun.replace(/s$/, '')}` : `${from}–${to} de ${total} ${noun}`}
      </p>
      {/* No celular a linha de controles ocupa a largura toda e quebra sozinha se faltar espaço. */}
      <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto sm:justify-end">
        <label htmlFor={sizeId} className="sr-only">
          Itens por página
        </label>
        <select
          id={sizeId}
          value={pageSize}
          onChange={(event) => onPageSizeChange(Number(event.target.value))}
          className="h-9 min-w-0 rounded-lg border border-input bg-card px-3 text-sm text-foreground outline-none transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30"
        >
          {PAGE_SIZES.map((size) => (
            <option key={size} value={size}>
              {size} por página
            </option>
          ))}
        </select>
        <Button
          type="button"
          variant="outline"
          size="icon-sm"
          className="size-9 sm:size-7"
          onClick={() => onPageChange(page - 1)}
          disabled={page <= 1}
          aria-label="Página anterior"
        >
          <ChevronLeft aria-hidden="true" />
        </Button>
        <span className="tabular-nums whitespace-nowrap" aria-live="polite">
          Página {page} de {pageCount}
        </span>
        <Button
          type="button"
          variant="outline"
          size="icon-sm"
          className="size-9 sm:size-7"
          onClick={() => onPageChange(page + 1)}
          disabled={page >= pageCount}
          aria-label="Próxima página"
        >
          <ChevronRight aria-hidden="true" />
        </Button>
      </div>
    </nav>
  );
}
