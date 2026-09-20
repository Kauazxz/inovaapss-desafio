import type { ReactNode } from 'react';

/** Título de uma seção da tela do cliente, com a linha de contexto. Sem card em volta (§57). */
export function SectionTitle({
  id,
  children,
  hint,
}: {
  id: string;
  children: ReactNode;
  hint?: string | undefined;
}) {
  return (
    <div>
      <h3 id={id} className="text-base font-semibold">
        {children}
      </h3>
      {hint ? <p className="text-[13px] text-muted-foreground">{hint}</p> : null}
    </div>
  );
}
