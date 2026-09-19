import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';

interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  description: string;
  /** Um único CTA, quando houver algo a fazer. */
  action?: ReactNode;
}

/**
 * Estado vazio de uma tela: diz o que vai aparecer aqui e o que fazer para isso acontecer.
 * Uma área só, sem grade de cards (§57).
 */
export function EmptyState({ icon: Icon, title, description, action }: EmptyStateProps) {
  return (
    <section
      className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border px-6 py-16 text-center"
      aria-live="polite"
    >
      <span className="mb-4 flex size-10 items-center justify-center rounded-full bg-muted text-muted-foreground">
        <Icon className="size-5" aria-hidden="true" />
      </span>
      <h3 className="text-base font-semibold">{title}</h3>
      <p className="mt-1 max-w-md text-sm text-muted-foreground">{description}</p>
      {action ? <div className="mt-5">{action}</div> : null}
    </section>
  );
}
