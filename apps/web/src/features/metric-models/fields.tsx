/**
 * Campos do painel de configuração. Nada de estado global: cada campo guarda TEXTO e o painel
 * converte para número na hora de validar (format.ts), para o input aceitar "", "-" e vírgula
 * sem que o valor vire NaN enquanto a pessoa digita.
 */
import { useId, type ReactNode } from 'react';

import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';

export const selectClassName =
  'h-9 w-full rounded-lg border border-input bg-card px-3 text-sm text-foreground outline-none transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 aria-invalid:border-destructive dark:bg-input/30';

export const textareaClassName =
  'min-h-28 w-full rounded-lg border border-input bg-card px-3 py-2 font-mono text-xs outline-none transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 aria-invalid:border-destructive dark:bg-input/30';

export function TextField({
  label,
  value,
  onChange,
  hint,
  type = 'text',
  disabled,
  className,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  hint?: string;
  type?: 'text' | 'number';
  disabled?: boolean;
  className?: string;
}) {
  const id = useId();
  return (
    <div className={cn('space-y-1', className)}>
      <Label htmlFor={id} className="text-xs">
        {label}
      </Label>
      <Input
        id={id}
        type={type === 'number' ? 'text' : type}
        inputMode={type === 'number' ? 'decimal' : undefined}
        value={value}
        disabled={disabled}
        aria-describedby={hint === undefined ? undefined : `${id}-ajuda`}
        onChange={(event) => onChange(event.target.value)}
      />
      {hint === undefined ? null : (
        <p id={`${id}-ajuda`} className="text-xs text-muted-foreground">
          {hint}
        </p>
      )}
    </div>
  );
}

export function SelectField<T extends string>({
  label,
  value,
  onChange,
  options,
  disabled,
  className,
}: {
  label: string;
  value: T;
  onChange: (value: T) => void;
  options: readonly { value: T; label: string }[];
  disabled?: boolean;
  className?: string;
}) {
  const id = useId();
  return (
    <div className={cn('space-y-1', className)}>
      <Label htmlFor={id} className="text-xs">
        {label}
      </Label>
      <select
        id={id}
        className={selectClassName}
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value as T)}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </div>
  );
}

export function TextareaField({
  label,
  value,
  onChange,
  hint,
  disabled,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  hint?: string;
  disabled?: boolean;
}) {
  const id = useId();
  return (
    <div className="space-y-1">
      <Label htmlFor={id} className="text-xs">
        {label}
      </Label>
      <textarea
        id={id}
        className={textareaClassName}
        value={value}
        disabled={disabled}
        aria-describedby={hint === undefined ? undefined : `${id}-ajuda`}
        onChange={(event) => onChange(event.target.value)}
      />
      {hint === undefined ? null : (
        <p id={`${id}-ajuda`} className="text-xs text-muted-foreground">
          {hint}
        </p>
      )}
    </div>
  );
}

/** Bloco com título dentro do painel lateral. */
export function PanelSection({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <section className="space-y-3 border-t border-border pt-5 first:border-t-0 first:pt-0">
      <div>
        <h4 className="text-sm font-medium">{title}</h4>
        {description === undefined ? null : (
          <p className="text-xs text-muted-foreground">{description}</p>
        )}
      </div>
      {children}
    </section>
  );
}
