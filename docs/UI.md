# Guia de interface

Como as telas do INOVAAPPS se parecem e por quê. Objetivo do desenho: **moderno, minimalista e fácil
de usar** — pouca borda, pouco peso visual, uma cor de ação só, e sempre dá para ler o que a tela
está dizendo sem esforço.

Quem estiver mexendo numa tela segue este arquivo. Quem quiser mudar uma regra daqui, muda aqui
primeiro e depois nas telas — senão o sistema volta a ficar com cinco jeitos de fazer a mesma coisa.

Fonte de cor dos **gráficos** é outra: [DATAVIZ.md](DATAVIZ.md) e `apps/web/src/lib/chart-theme.ts`.

---

## 1. Os tokens são a única fonte de cor

Tudo vem de `apps/web/src/index.css`. Nunca escreva cor crua (`#fff`, `bg-white`, `text-black`,
`bg-slate-100`) num componente: além de fugir do padrão, quebra o modo escuro.

| Papel                  | Token / classe                                                    | Onde aparece                                      |
| ---------------------- | ----------------------------------------------------------------- | ------------------------------------------------- |
| Fundo da página        | `bg-background`                                                   | fundo levemente frio, atrás de tudo               |
| Superfície de conteúdo | `bg-card`                                                         | cards, campos, menus — branco no claro            |
| Texto                  | `text-foreground`                                                 | texto normal                                      |
| Texto de apoio         | `text-muted-foreground`                                           | descrição, rótulo de tabela, legenda              |
| **Cor de ação**        | `bg-primary` / `text-primary`                                     | botão principal, sublinhado da aba ativa          |
| Realce da cor de ação  | `bg-accent` / `text-accent-foreground`                            | item de menu ativo, avatar, ícone de estado vazio |
| Separador              | `border-border`                                                   | linha de tabela, divisória                        |
| Erro / destrutivo      | `text-destructive` / `bg-destructive/10`                          | mensagem de erro, botão de excluir                |
| Classes de saúde       | `class-normal`, `class-attention`, `class-risk`, `class-critical` | **só** para dizer risco                           |

> Verde, âmbar, laranja e vermelho são reservados à saúde do cliente. Nenhum enfeite usa essas
> cores — se aparecer vermelho na tela, é porque algo está crítico, não porque ficou bonito.

A cor de ação é um **azul-petróleo**. Ela marca o que se pode fazer e onde você está; o resto da
tela é neutro. Se uma tela tem cinco coisas em azul, quatro não são a ação principal.

## 2. Superfícies: sombra em vez de borda

Conteúdo mora em cima de `bg-background` numa superfície elevada, não dentro de uma caixa
desenhada com borda.

```tsx
// Certo — o componente pronto já traz tudo:
<Card>
  <CardHeader><CardTitle>Título</CardTitle></CardHeader>
  <CardContent>…</CardContent>
</Card>

// Quando não cabe um Card (um bloco solto dentro de outro), use o mesmo acabamento:
<div className="rounded-xl bg-card p-5 shadow-soft ring-1 ring-foreground/5">…</div>

// Errado — caixa de borda dura, o padrão antigo:
<div className="rounded-lg border border-border p-4">…</div>
```

Três níveis de elevação, e só esses:

| Classe           | Para quê                                          |
| ---------------- | ------------------------------------------------- |
| `shadow-soft`    | card, painel, botão principal — o padrão          |
| `shadow-float`   | o que flutua sobre a página: a barra de navegação |
| `shadow-popover` | o que abre por cima: menu suspenso, diálogo       |

Não use `shadow-md`, `shadow-lg` e afins: eles são cinza-neutro e destoam.

Raio de canto: `rounded-xl` em superfícies, `rounded-lg` em controles, `rounded-full` em pílulas,
selos e avatares.

Borda tracejada (`border-dashed`) fica reservada ao estado vazio — ela diz "aqui ainda não tem nada".

## 3. Controles têm todos a mesma altura

**`h-9`** (36 px) é a altura de botão, campo de texto, `<select>` e lista de abas. Campos que não
usam o componente `<Input>` copiam a mesma linha:

```tsx
const FIELD =
  'h-9 w-full rounded-lg border border-input bg-card px-3 text-sm outline-none transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50';
```

`size="sm"` (`h-8`) existe para ações secundárias dentro de uma linha de tabela; `size="lg"`
(`h-10`) para o botão único de uma tela de entrada.

O anel de foco (`focus-visible:ring-3 focus-visible:ring-ring/50`) **nunca** é removido — é ele que
permite usar o sistema pelo teclado.

## 4. Ritmo da página

```tsx
<PageHeader title="Clientes" description="Uma linha dizendo o que esta tela responde.">
  <Button>Novo cliente</Button>
</PageHeader>

<div className="space-y-6">…</div>
```

- Título da tela: só o `PageHeader` (`text-2xl`), um por tela.
- Título de card: `text-base font-medium`. Título de seção dentro de um card: `text-sm font-medium`.
- Corpo: `text-sm`. Apoio, legenda e rótulo de tabela: `text-xs text-muted-foreground`.
- Entre blocos de uma tela: `space-y-6`. Dentro de um card: o espaçamento do próprio card.
- Número que se compara na vertical (valor, score, dinheiro): `tabular-nums`.

Largura máxima do conteúdo é do layout (`cn-container`), não da tela — não repita `max-w-*` na página.

## 5. Tabelas

O componente `<Table>` já entrega o padrão: cabeçalho em `text-xs` cinza, linha com `py-3` e
divisória fina. Na célula:

- nome do registro à esquerda, número à direita (`text-right tabular-nums`);
- ação da linha em `variant="ghost" size="sm"`, não botão cheio;
- classe de saúde é **selo com nome escrito**, nunca uma bolinha colorida sozinha.

## 6. Navegação

A barra é uma cápsula flutuante fixa no topo (`PrivateLayout`): ela acompanha a rolagem para trocar
de tela de qualquer ponto da página. Nove telas cabem em cinco entradas — `Métricas` e `Dados` abrem
submenu, e a conta guarda organização, configurações e saída.

Tela nova entra em `apps/web/src/routes/nav.ts`, com uma `hint` de uma linha dizendo o que ela
responde — é essa frase que aparece no submenu. Se a barra passar de seis entradas, agrupe; não
aperte mais um link lá dentro.

## 7. Estados (§57 da spec)

Toda tela que carrega dados tem os três:

- **carregando**: `<Skeleton>` no formato do conteúdo que vem (não um "Carregando…" solto);
- **vazio**: `<EmptyState>` dizendo o que vai aparecer ali e qual é o próximo passo;
- **erro**: texto em `text-destructive` com o que aconteceu e um botão "Tentar de novo".

Nunca deixe a tela em branco enquanto espera.

## 8. Responsividade: a tela é do tamanho que for

Não existe "tela de desenvolvedor". A mesma página tem de ficar boa no celular de 360 px, no tablet,
no notebook de 1366 px e no monitor grande — e em nenhum desses tamanhos ela pode ficar confusa.

**Escreva o celular primeiro.** A classe sem prefixo é o layout do celular; os prefixos vão soltando
espaço conforme sobra: `sm:` 640 px · `md:` 768 px · `lg:` 1024 px · `xl:` 1280 px.

```tsx
// Certo — uma coluna no celular, duas no tablet, quatro no monitor:
<div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">

// Errado — três colunas espremidas num celular de 360 px:
<div className="grid grid-cols-3 gap-3">
```

Regras que valem em toda tela:

- **Nenhum grid de duas ou mais colunas sem prefixo.** Comece em uma coluna.
- **Largura fixa só em coisa pequena** (ícone, selo, avatar). Conteúdo usa `w-full` com `max-w-*`.
  Dentro de um `flex`, quem pode encolher leva `min-w-0` — sem isso o texto estoura a tela.
- **A página nunca rola para o lado.** Rolagem horizontal é permitida só dentro de uma tabela
  (o `<Table>` já embrulha numa área rolável) ou de uma faixa de abas.
- **Tabela larga no celular:** esconda as colunas menos importantes com `hidden md:table-cell`
  (no `<TableHead>` e no `<TableCell>` da mesma coluna) em vez de deixar dez colunas espremidas. O
  que sobra tem de contar a história: quem é o cliente, como ele está, o que fazer.
- **Filtros e barras de ação** viram uma coluna no celular (`flex flex-col gap-2 sm:flex-row`), com
  os campos em largura total; nada de filtro cortado pela metade.
- **Diálogo** no celular ocupa quase tudo, sem colar na borda: `w-[calc(100%-2rem)] max-w-lg`.
- **Ação nunca aparece só no `hover`** — no celular não existe hover. Se um botão só aparece ao
  passar o mouse, ele também fica visível a partir de `md:` para baixo.
- **Alvo de toque** de 36 px para cima (mais um motivo para o `h-9`), com espaço entre um e outro.
- **Número e data** não quebram linha no meio (`whitespace-nowrap`), mas texto longo quebra.

Antes de dizer que uma tela está pronta, olhe ela em **360 px, 768 px e 1440 px**. No navegador:
F12 e o botão de celular/tablet (Ctrl+Shift+M no Chrome e no Edge).

## 9. Acessibilidade

- Todo ícone sozinho precisa de `aria-label` no botão e `aria-hidden="true"` no ícone.
- Cor nunca é a única informação: risco vem com o nome escrito, erro vem com texto.
- Ordem de tabulação segue a ordem visual; diálogo prende o foco (o `Dialog` já faz isso).
- Alvo de clique no celular: mínimo 36 px — mais um motivo para a altura `h-9`.
