import type { ReactNode } from 'react';

interface PageHeaderProps {
  title: string;
  description?: string;
  /** Ações à direita (botões, filtros). */
  children?: ReactNode;
}

/** Cabeçalho padrão de uma tela: título, contexto em uma linha e ações. Sem card em volta (§57). */
export function PageHeader({ title, description, children }: PageHeaderProps) {
  return (
    <div className="mb-6 flex flex-wrap items-start justify-between gap-x-4 gap-y-3">
      <div className="min-w-0">
        <h2 className="cn-font-heading text-xl font-semibold tracking-tight text-balance">
          {title}
        </h2>
        {description ? (
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">{description}</p>
        ) : null}
      </div>
      {children ? <div className="flex shrink-0 items-center gap-2">{children}</div> : null}
    </div>
  );
}
