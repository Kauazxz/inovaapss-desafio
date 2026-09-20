import { useId, type ReactNode } from 'react';

import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';

export interface FormFieldProps {
  label: string;
  error?: string | undefined;
  hint?: string | undefined;
  className?: string | undefined;
  /** Recebe o id e os atributos aria para ligar ao controle (input/select). */
  children: (control: {
    id: string;
    'aria-invalid': true | undefined;
    'aria-describedby': string | undefined;
  }) => ReactNode;
}

/** Rótulo + controle + ajuda/erro, com os atributos de acessibilidade já ligados. */
export function FormField({ label, error, hint, className, children }: FormFieldProps) {
  const id = useId();
  const hintId = `${id}-ajuda`;
  const errorId = `${id}-erro`;
  const describedBy = [hint ? hintId : null, error ? errorId : null].filter(Boolean).join(' ');
  return (
    <div className={cn('space-y-1.5', className)}>
      <Label htmlFor={id}>{label}</Label>
      {children({
        id,
        'aria-invalid': error ? true : undefined,
        'aria-describedby': describedBy === '' ? undefined : describedBy,
      })}
      {hint ? (
        <p id={hintId} className="text-xs text-muted-foreground">
          {hint}
        </p>
      ) : null}
      {error ? (
        <p id={errorId} className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  );
}

export const selectClassName =
  'h-9 w-full rounded-xl border border-input bg-card px-3 text-sm text-foreground outline-none transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 aria-invalid:border-destructive dark:bg-input/30';
