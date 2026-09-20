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
      className="flex flex-wrap items-center justify-between gap-3 text-sm text-muted-foreground"
    >
      <p>
        {total === 0 ? `Nenhum ${noun.replace(/s$/, '')}` : `${from}–${to} de ${total} ${noun}`}
      </p>
      <div className="flex items-center gap-2">
        <label htmlFor={sizeId} className="sr-only">
          Itens por página
        </label>
        <select
          id={sizeId}
          value={pageSize}
          onChange={(event) => onPageSizeChange(Number(event.target.value))}
          className="h-8 rounded-lg border border-input bg-transparent px-2 text-sm text-foreground outline-none focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30"
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
          onClick={() => onPageChange(page - 1)}
          disabled={page <= 1}
          aria-label="Página anterior"
        >
          <ChevronLeft aria-hidden="true" />
        </Button>
        <span className="tabular-nums" aria-live="polite">
          Página {page} de {pageCount}
        </span>
        <Button
          type="button"
          variant="outline"
          size="icon-sm"
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
