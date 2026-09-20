export interface KpiItem {
  label: string;
  value: string;
  /** Variação vs. período anterior já formatada (`+2`, `−R$ 6 mil`); `null` sem período anterior. */
  delta?: string | null;
  /** Texto de contexto ao lado do valor (ex.: a classe). */
  hint?: string;
}

/**
 * Números em texto simples, em uma linha, cada um com a variação vs. período anterior
 * (DATAVIZ.md §4.1 e §4.2). São poucos números — um gráfico esconderia o valor.
 */
export function KpiRow({ items, label }: { items: KpiItem[]; label: string }) {
  return (
    // Duas colunas no celular (quatro ficariam ilegíveis), quatro a partir de lg.
    <dl
      aria-label={label}
      className="grid grid-cols-2 gap-x-5 gap-y-5 border-b border-border pb-6 sm:gap-x-8 lg:grid-cols-4"
    >
      {items.map((item) => (
        <div key={item.label} className="min-w-0">
          <dt className="text-sm text-muted-foreground">{item.label}</dt>
          <dd className="mt-1 flex flex-wrap items-baseline gap-x-2 gap-y-1">
            {/* Número em texto simples: figuras proporcionais, `tabular-nums` só em tabela
                (DATAVIZ.md §2.2). Não quebra no meio; encolhe no celular para caber inteiro. */}
            <span className="text-xl font-semibold tracking-tight whitespace-nowrap sm:text-3xl">
              {item.value}
            </span>
            {item.delta ? (
              <span className="text-xs text-muted-foreground">
                {item.delta}
                <span className="sr-only"> em relação ao período anterior</span>
              </span>
            ) : null}
            {item.hint ? <span className="text-xs text-muted-foreground">{item.hint}</span> : null}
          </dd>
        </div>
      ))}
    </dl>
  );
}
