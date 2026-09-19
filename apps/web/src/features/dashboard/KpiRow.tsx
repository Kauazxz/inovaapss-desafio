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
    <dl
      aria-label={label}
      className="grid grid-cols-2 gap-x-8 gap-y-4 border-b border-border pb-6 md:grid-cols-4"
    >
      {items.map((item) => (
        <div key={item.label}>
          <dt className="text-sm text-muted-foreground">{item.label}</dt>
          <dd className="mt-1 flex flex-wrap items-baseline gap-x-2">
            <span className="text-3xl font-semibold tracking-tight">{item.value}</span>
            {item.delta ? (
              <span className="text-sm text-muted-foreground">
                {item.delta}
                <span className="sr-only"> em relação ao período anterior</span>
              </span>
            ) : null}
            {item.hint ? <span className="text-sm text-muted-foreground">{item.hint}</span> : null}
          </dd>
        </div>
      ))}
    </dl>
  );
}
