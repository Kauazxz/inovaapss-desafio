/**
 * Edição em linha: a célula da tabela é o campo.
 *
 * A regra da tela é uma só — clicou no dado, abre um bloquinho com o que dá para escolher ali
 * mesmo. Quem usa não precisa saber que "tipo" vem da definição da métrica e que "peso" vem da
 * versão do modelo: as duas coisas se editam do mesmo jeito, no mesmo lugar.
 */
import { Check, ChevronDown, Loader2 } from 'lucide-react';
import { useId, useState, type ReactNode } from 'react';

import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';

/** Célula clicável: mostra o valor e abre o bloquinho de edição. */
export function InlineCell({
  label,
  children,
  block,
  disabled = false,
  disabledHint,
  pending = false,
  align = 'start',
  right = false,
}: {
  /** Como a célula se chama para quem usa leitor de tela ("Tipo de Chamados críticos"). */
  label: string;
  children: ReactNode;
  /** Conteúdo do bloquinho; recebe `close` para fechar depois de aplicar. */
  block: (close: () => void) => ReactNode;
  disabled?: boolean;
  /** Por que não dá para editar — vira o `title` da célula. */
  disabledHint?: string;
  pending?: boolean;
  align?: 'start' | 'end';
  /** Números ficam à direita, como na coluna de peso. */
  right?: boolean;
}) {
  const [open, setOpen] = useState(false);

  if (disabled) {
    return (
      <span
        className={cn('inline-block px-2 py-1', right && 'tabular-nums')}
        title={disabledHint}
        aria-description={disabledHint}
      >
        {children}
      </span>
    );
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={`Editar ${label}`}
          data-inline-cell={open ? 'open' : 'closed'}
          className={cn(
            'group/cell -my-1 inline-flex max-w-full items-center gap-1 rounded-md border border-transparent px-2 py-1 text-left outline-none transition-colors hover:border-border hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50 data-[inline-cell=open]:border-border data-[inline-cell=open]:bg-muted',
            right && 'tabular-nums',
          )}
        >
          <span className="truncate">{children}</span>
          {pending ? (
            <Loader2 className="size-3 shrink-0 animate-spin opacity-60" aria-hidden="true" />
          ) : (
            <ChevronDown
              className="size-3 shrink-0 opacity-0 transition-opacity group-hover/cell:opacity-50 group-focus-visible/cell:opacity-70 group-data-[inline-cell=open]/cell:opacity-70"
              aria-hidden="true"
            />
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent align={align}>{block(() => setOpen(false))}</PopoverContent>
    </Popover>
  );
}

/** Título do bloquinho: o que está sendo mudado e, quando ajuda, uma linha de contexto. */
export function BlockTitle({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="mb-2 px-1">
      <p className="text-xs font-medium text-muted-foreground">{title}</p>
      {hint === undefined ? null : <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

export interface BlockOption<T extends string> {
  value: T;
  label: string;
  /** Uma linha explicando a opção, quando o nome sozinho não basta. */
  hint?: string;
  disabled?: boolean;
}

/** As opções disponíveis para o campo, com a atual marcada. */
export function BlockOptions<T extends string>({
  options,
  value,
  onPick,
}: {
  options: readonly BlockOption<T>[];
  value: T | null;
  onPick: (value: T) => void;
}) {
  return (
    <div className="max-h-72 overflow-y-auto">
      {options.map((option) => {
        const current = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            disabled={option.disabled}
            aria-current={current ? 'true' : undefined}
            onClick={() => onPick(option.value)}
            className={cn(
              'flex w-full items-start gap-2 rounded-lg px-2 py-1.5 text-left text-sm outline-none transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:bg-accent focus-visible:text-accent-foreground disabled:pointer-events-none disabled:opacity-50',
              current && 'font-medium',
            )}
          >
            <Check
              className={cn('mt-0.5 size-3.5 shrink-0', current ? 'opacity-100' : 'opacity-0')}
              aria-hidden="true"
            />
            <span className="flex min-w-0 flex-col">
              <span>{option.label}</span>
              {option.hint === undefined ? null : (
                <span className="text-xs font-normal text-muted-foreground">{option.hint}</span>
              )}
            </span>
          </button>
        );
      })}
    </div>
  );
}

/**
 * Bloquinho de digitar: o campo começa VAZIO com o valor de hoje só como marca-d'água, então
 * digitar já substitui — não é preciso apagar o número antigo antes.
 */
export function BlockInput({
  label,
  placeholder,
  suffix,
  onSubmit,
  submitLabel = 'Aplicar',
  extra,
  inputMode = 'decimal',
}: {
  label: string;
  /** O valor de hoje, como marca-d'água. */
  placeholder: string;
  suffix?: string;
  /** Devolve uma mensagem de erro para segurar o bloquinho aberto, ou `null` quando aplicou. */
  onSubmit: (typed: string) => string | null;
  submitLabel?: string;
  /** Ações extras no rodapé (ex.: tirar do modelo). */
  extra?: ReactNode;
  inputMode?: 'decimal' | 'text';
}) {
  const id = useId();
  const [typed, setTyped] = useState('');
  const [error, setError] = useState<string | null>(null);

  const submit = () => {
    const message = onSubmit(typed);
    setError(message);
  };

  return (
    <form
      className="space-y-2"
      onSubmit={(event) => {
        event.preventDefault();
        submit();
      }}
    >
      <label htmlFor={id} className="px-1 text-xs font-medium text-muted-foreground">
        {label}
      </label>
      <div className="flex items-center gap-2">
        <input
          id={id}
          autoFocus
          type="text"
          inputMode={inputMode}
          value={typed}
          placeholder={placeholder}
          aria-invalid={error !== null}
          aria-describedby={error === null ? undefined : `${id}-erro`}
          onChange={(event) => {
            setTyped(event.target.value);
            setError(null);
          }}
          className="h-9 w-full rounded-lg border border-input bg-card px-3 text-sm outline-none transition-colors placeholder:text-muted-foreground/70 focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 aria-invalid:border-destructive dark:bg-input/30"
        />
        {suffix === undefined ? null : (
          <span className="text-sm text-muted-foreground">{suffix}</span>
        )}
      </div>
      {error === null ? null : (
        <p id={`${id}-erro`} role="alert" className="px-1 text-xs text-destructive">
          {error}
        </p>
      )}
      <div className="flex items-center justify-between gap-2">
        <div>{extra}</div>
        <button
          type="submit"
          className="h-8 rounded-lg bg-primary px-3 text-xs font-medium text-primary-foreground outline-none transition-opacity hover:opacity-90 focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          {submitLabel}
        </button>
      </div>
    </form>
  );
}

/** Ação secundária dentro do bloquinho (tirar do modelo, abrir a configuração completa…). */
export function BlockAction({
  children,
  onClick,
  destructive = false,
}: {
  children: ReactNode;
  onClick: () => void;
  destructive?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'rounded-lg px-2 py-1 text-xs outline-none transition-colors hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50',
        destructive ? 'text-destructive' : 'text-muted-foreground',
      )}
    >
      {children}
    </button>
  );
}
