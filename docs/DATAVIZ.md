# Visualização de dados — guia do produto

Guia de como o produto mostra números e gráficos. Vale para **todo o frontend** (ajustes A1–A3 da
[SPEC.md](SPEC.md)). Se um gráfico não segue este guia, ele está errado, mesmo que "fique bonito".

Base: _Storytelling com Dados_ (Cole Nussbaumer Knaflic), reconciliado com um método de validação
de cores para daltonismo e contraste (seção 3). Onde os dois discordam, o livro manda no **formato**
e o método manda na **cor** — os dois concordam em quase tudo.

O produto precisa responder em segundos: **com quem falar, por quê, em que ordem, o que fazer**
(§1 da spec). Cada gráfico existe para responder uma dessas perguntas. Se não responde nenhuma, não
entra.

---

## 1. Princípios (o livro aplicado ao nosso produto)

### 1.1 Contexto antes do gráfico

Antes de desenhar, responda: **quem** vai olhar (gestor de carteira), **o que** precisa decidir
(a quem ligar hoje) e **como** o gráfico ajuda nessa decisão. Um gráfico sem decisão por trás é
decoração — vira número simples ou some.

### 1.2 Escolher o visual certo

| A informação é...                                                         | Use                                                                                              | Nunca                                            |
| ------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ | ------------------------------------------------ |
| 1 ou 2 números (ex.: "MRR em risco: R$ 84 mil")                           | **texto grande** (número + legenda em uma linha, com a variação ao lado)                         | um gráfico de barra com uma barra só             |
| Algo para consultar valor a valor                                         | **tabela** (com ordenação e busca)                                                               | heatmap decorativo                               |
| Ranking ou comparação entre categorias (clientes, métricas, dimensões)    | **barra horizontal**, ordenada pelo valor                                                        | barra vertical com rótulos tortos, pizza         |
| Evolução no tempo                                                         | **linha** (uma cor de destaque, o resto em cinza)                                                | área empilhada, barras por período               |
| Antes → depois por item (peso atual → sugerido, health atual → projetado) | **slopegraph** ou **dumbbell** (haltere)                                                         | duas barras lado a lado                          |
| Parte do todo (distribuição das classes)                                  | **barra horizontal ordenada** ou **uma única barra empilhada 100 %** com rótulo em cada segmento | **pizza, rosca, 3D, área empilhada** (ajuste A1) |
| Duas medidas de escala diferente (ex.: MRR e health)                      | **dois gráficos** um abaixo do outro, mesmo eixo X                                               | eixo Y duplo                                     |

Por que não pizza: o olho compara ângulos e áreas muito mal; quatro fatias parecidas viram adivinhação.
Uma barra ordenada resolve em um olhar e ainda cabe o rótulo.

### 1.3 Decluttering — tirar o que não é dado

- Sem bordas em volta do gráfico ou dos cards.
- Gridlines: **nenhuma** ou hairline de 1 px, sólida (nunca tracejada), um tom acima do fundo.
- Sem legenda quando dá para **rotular direto** na marca (fim da linha, ponta da barra). Com 3 ou mais
  séries, ou quando os rótulos colidem, uma legenda compacta acima do gráfico é permitida — e o rótulo
  direto continua na série que importa.
- Eixo Y de barras **começa em zero**, sempre. Linhas podem recortar a escala, desde que o eixo mostre
  os valores.
- Sem rótulo em todo ponto. Rotule o último ponto, o extremo e a série da história. O tooltip e a
  tabela carregam o resto.
- Sem sombra, degradê, ícone decorativo ou animação de entrada.
- Texto na horizontal. Se o nome não cabe, o gráfico vira horizontal — não o texto vira diagonal.

### 1.4 Atenção com pré-atenção — cinza como padrão e uma cor de destaque

O olho vai primeiro para o que é diferente. Então:

- **Tudo nasce em cinza.** A cor de destaque (azul) vai só para o que a história aponta: o cliente
  selecionado, a barra que cruzou a faixa, o ponto que mudou.
- **Uma** cor de destaque por gráfico. Duas já são competição.
- **Cores semânticas** (verde/amarelo/laranja/vermelho) só para as **classes** Normal / Atenção /
  Risco / Crítico — e nunca sozinhas: sempre acompanhadas do **nome da classe em texto** (pílula
  "Risco", rótulo no eixo). Elas também precisam ser distinguíveis por daltônicos (validado na seção 2.1).
- Negrito, tamanho e posição também são pré-atentivos. Use-os antes de usar mais cor.

### 1.5 Título que afirma o "e daí?"

O título é a conclusão, não a descrição do eixo.

| Não                              | Sim                                                             |
| -------------------------------- | --------------------------------------------------------------- |
| "Health por cliente"             | "3 clientes devem entrar em Crítico no próximo período"         |
| "Distribuição de classes"        | "1 em cada 4 clientes está em Risco ou Crítico"                 |
| "Evolução do health — Alfa Ltda" | "Alfa Ltda caiu 18 pontos em 3 meses e já está abaixo da média" |
| "Pesos atual × sugerido"         | "A calibração sugere subir Chamados críticos de 18 % para 24 %" |

Os títulos são **dinâmicos**: o frontend monta a frase a partir dos dados. Quando não há dado
suficiente para afirmar algo, o título diz isso ("Sem histórico suficiente para projetar").

### 1.6 Anotação direta

O ponto que importa recebe uma anotação curta **no próprio gráfico** ("SLA caiu 24 p.p."), com uma
linha fina ligando ao ponto. Não deixe o leitor procurar na legenda ou no tooltip.

### 1.7 Ordem com intenção

Ranking é por **prioridade** (ou pelo valor), nunca alfabético. A ordem já conta parte da história:
o primeiro da lista é o primeiro a ligar.

### 1.8 Acessibilidade e honestidade

- Todo gráfico tem um **irmão em tabela** (botão "Ver como tabela"). É o fallback para leitor de
  tela, impressão e para quem quer o número exato.
- Tooltip complementa, nunca é o único jeito de ler um valor.
- Escala e unidade sempre visíveis. Projeção é rotulada como projeção (seção 5).
- Nunca truncar eixo para exagerar diferença.

---

## 2. Tokens de design

Os valores abaixo são a **única** fonte de cor dos gráficos. O arquivo
`apps/web/src/lib/chart-theme.ts` deve materializar estes tokens para o Recharts (e o
`tailwind.config` os expõe para o resto da UI). Ninguém escreve hex direto num componente de gráfico.

### 2.1 Paleta

| Token                 | Uso                                                                   | Claro                                  | Escuro    |
| --------------------- | --------------------------------------------------------------------- | -------------------------------------- | --------- |
| `chart.surface`       | fundo do gráfico                                                      | `#fcfcfb`                              | `#1a1a19` |
| `chart.ink`           | texto principal (título, valores)                                     | `#0b0b0b`                              | `#ffffff` |
| `chart.inkSecondary`  | subtítulo, anotações                                                  | `#52514e`                              | `#c3c2b7` |
| `chart.muted`         | rótulos de eixo, ticks                                                | `#898781`                              | `#898781` |
| `chart.neutral`       | **marca padrão** (barras/linhas sem destaque, "os outros", a média)   | `#c3c2b7`                              | `#52514e` |
| `chart.neutralStrong` | marca neutra que precisa de mais peso (ex.: health atual no dumbbell) | `#898781`                              | `#898781` |
| `chart.grid`          | hairline de grid e eixo                                               | `#e1e0d9`                              | `#2c2c2a` |
| `chart.accent`        | **a única cor de destaque**                                           | `#2a78d6`                              | `#3987e5` |
| `chart.accentSoft`    | segundo tom do destaque (projeção, área a 10 %)                       | `#86b6ef`                              | `#1c5cab` |
| `class.normal`        | classe Normal (80–100)                                                | `#0ca30c`                              | `#0ca30c` |
| `class.attention`     | classe Atenção (60–79)                                                | `#fab219`                              | `#fab219` |
| `class.risk`          | classe Risco (40–59)                                                  | `#ec835a`                              | `#ec835a` |
| `class.critical`      | classe Crítico (0–39)                                                 | `#d03b3b`                              | `#d03b3b` |
| `band.fill`           | faixa-alvo / faixas de classe no fundo                                | a cor da classe a **8 % de opacidade** | idem      |

Regras sobre a paleta:

- **Cinza é o padrão; azul é a exceção.** Um gráfico inteiro azul está errado.
- As quatro cores de classe são **reservadas**: não servem para série, botão nem ícone decorativo.
- Cor de classe **nunca vai sozinha**. Vai com o nome ("Risco") em texto e, onde couber, com a
  forma (posição na faixa, ícone). No fundo claro, `class.attention` e `class.risk` ficam abaixo de
  3:1 de contraste por escolha (tons claros leem como "alerta" e não como "erro"), então o rótulo
  textual não é opcional — é o que garante a leitura.
- Texto **não** usa a cor da série. Valores, rótulos e legendas ficam em `chart.ink` /
  `chart.inkSecondary` / `chart.muted`; a cor fica na marca (barra, ponto, pílula) ao lado.
  Exceção: uma palavra do título pode ir em `chart.accent` (contraste 4,3:1 no claro, 4,8:1 no
  escuro) quando o gráfico destaca exatamente aquele item.
- Modo escuro não é "inverter": são os valores da coluna Escuro, definidos em
  `@media (prefers-color-scheme: dark)` e em `[data-theme="dark"]`.

Validação de cor (feita em 19/09/2026 com o validador do método; refaça se mudar qualquer hex):

| Conjunto                                                              | Resultado                                                                                                                                                                                                                         |
| --------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `chart.accent` + `class.critical` no claro                            | passa em todos os testes (pior par ΔE 23,8 sob protanopia; 31,6 visão normal; contraste ≥ 3:1)                                                                                                                                    |
| As 4 cores de classe, pares adjacentes (Normal↔Atenção↔Risco↔Crítico) | separação para daltônicos: pior par Risco↔Atenção ΔE 11,3 (deutan) — acima do alvo 8. Visão normal: 13,6 nesse mesmo par — abaixo do piso 15 usado para séries categóricas, por isso o **rótulo textual da classe é obrigatório** |
| `class.attention` e `class.risk` no fundo claro                       | contraste 1,8:1 e 2,6:1 — exige rótulo visível ou tabela (temos os dois)                                                                                                                                                          |

### 2.2 Tipografia

| Elemento                                                       | Tamanho  | Peso | Cor                                                               |
| -------------------------------------------------------------- | -------- | ---- | ----------------------------------------------------------------- |
| Título do gráfico (o "e daí?")                                 | 16 px    | 600  | `chart.ink`                                                       |
| Subtítulo / contexto (janela, fonte, "projeção por tendência") | 13 px    | 400  | `chart.inkSecondary`                                              |
| Número grande (texto simples)                                  | 32–40 px | 600  | `chart.ink` (figuras proporcionais; `tabular-nums` só em tabelas) |
| Rótulo direto na marca                                         | 12 px    | 500  | `chart.ink`                                                       |
| Anotação                                                       | 12 px    | 400  | `chart.inkSecondary`                                              |
| Ticks de eixo                                                  | 11 px    | 400  | `chart.muted`                                                     |

Fonte: a mesma sans da interface (`Inter`, com `system-ui` de fallback). Nada de serifa ou display.

### 2.3 Tamanhos mínimos e marcas

| Marca                                        | Especificação                                                                                                   |
| -------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| Barra                                        | espessura **≤ 24 px**, canto de 4 px só na ponta do dado, reta na base; 2 px de fundo entre barras que se tocam |
| Linha                                        | 2 px, junções arredondadas                                                                                      |
| Ponto / marcador                             | ≥ 8 px de diâmetro, anel de 2 px na cor do fundo quando cruza uma linha                                         |
| Área sob linha                               | a cor da série a 10 % de opacidade, só quando é uma série                                                       |
| Linhas de referência (faixas 80/60/40, meta) | 1 px, cor `chart.grid`; rótulo em `chart.muted` na ponta                                                        |
| Altura mínima de um gráfico                  | 160 px (+ 24 px por linha em barras horizontais)                                                                |
| Área de clique/hover                         | ≥ 24 px, maior que a marca                                                                                      |

### 2.4 Rótulos e tooltip

- Barra → valor na ponta. Linha → valor no último ponto. Dumbbell → os dois valores nas pontas.
- Formato de número: `48` (inteiro para health/risk/priority), `R$ 12,4 mil` (moeda compacta),
  `24 p.p.` (variação de percentual), `−19 %` (variação relativa, com sinal).
- Rótulo que não cabe **não é cortado**: vai para fora da marca ou fica só no tooltip e na tabela.
- Tooltip: nome, valor, classe (com o nome), confiança e a evidência principal — as mesmas colunas
  da tabela da tela. Aparece no hover e no foco de teclado.
- Ao recarregar dados, manter o gráfico anterior a 60 % de opacidade; nunca piscar um skeleton.

---

## 3. Reconciliação com o método de validação de cores

O método usado para validar a paleta trabalha com "quatro trabalhos" da cor (identidade, magnitude,
polaridade, estado) e checa lightness, croma, separação para daltônicos e contraste com um script.
Como ele encaixa no livro:

| Tema                                       | O livro diz                              | O método diz                                      | O que fazemos                                                                                                      |
| ------------------------------------------ | ---------------------------------------- | ------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| Cor padrão                                 | cinza + uma cor de destaque              | "ênfase": uma série em destaque, o resto em cinza | igual — é a nossa forma padrão                                                                                     |
| Séries com identidade própria (categórica) | evitar; rotular direto                   | até 8 tons em ordem fixa, validados               | **não usamos** série categórica no produto; se um dia precisar, seguir a ordem validada do método e rotular direto |
| Legenda                                    | dispensar quando o rótulo direto resolve | sempre presente com ≥ 2 séries                    | rótulo direto sempre; legenda compacta a partir de 3 séries ou quando os rótulos colidem                           |
| Cores de estado                            | usar com moderação e com texto           | reservadas, sempre com ícone + rótulo             | as 4 classes, sempre com o nome em texto                                                                           |
| Gridlines                                  | tirar                                    | hairline sólida recessiva                         | nenhuma ou hairline de 1 px sólida                                                                                 |
| Eixo duplo                                 | evitar                                   | proibido                                          | proibido                                                                                                           |
| Tabela alternativa                         | (não fala)                               | obrigatória                                       | obrigatória ("Ver como tabela")                                                                                    |
| Validar cor                                | (não fala)                               | rodar o validador, não "olhar"                    | valores da seção 2.1 validados; revalidar a cada mudança de hex                                                    |

---

## 4. Catálogo — cada elemento das telas

Referência: §39 (dashboard), §40 (cliente), §43 (calibração) da spec.

### 4.1 Dashboard › aba "Em risco" (§39)

| Elemento                                             | Visual                                                                                                                                                 | Por quê                                                                   |
| ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------- |
| Clientes ativos · críticos · em risco · MRR em risco | **4 números em texto simples**, em uma linha, cada um com a variação vs. período anterior (`+2` / `−R$ 6 mil`) e a classe em texto quando aplicável    | são 4 números; um gráfico esconderia o valor                              |
| **Gráfico de forecast priorizado** (ajuste A2)       | **dumbbell horizontal**, uma linha por cliente, ordenado por `priority_score` — seção 5                                                                | é o gráfico que responde "com quem falar, em que ordem e quem vai piorar" |
| Ranking por prioridade (tabela §39)                  | **tabela** ordenada por prioridade: Prioridade, Cliente, Health (número + pílula da classe), Risco, Confiança, Valor mensal, Principal evidência, Ação | consulta valor a valor; a tabela é o "irmão" do gráfico de forecast       |
| Health / Risk / Confiança por cliente na tabela      | número + pílula com o **nome da classe**; confiança como número (`91 %`), sem barra                                                                    | número é mais rápido que barra em célula                                  |
| CTA para análise                                     | botão "Analisar" → `/clients/:id`                                                                                                                      | ação, não visual                                                          |

### 4.2 Dashboard › aba "Geral" (§39)

| Elemento                                                              | Visual                                                                                                                                                                                                                                                           | Por quê                                                        |
| --------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------- |
| Distribuição Normal / Atenção / Risco / Crítico                       | **barra horizontal ordenada** (Crítico no topo, com contagem e % na ponta) **ou** uma **única barra empilhada 100 %** com o nome da classe e a % dentro de cada segmento; cor da classe; título com o "e daí?" ("1 em cada 4 clientes está em Risco ou Crítico") | ajuste A1 — pizza é proibida; barra permite comparar e rotular |
| MRR · ativos · cancelados                                             | **texto simples** (3 números) com variação                                                                                                                                                                                                                       | idem 4.1                                                       |
| Saúde por dimensão (Atendimento, SLA, Uso, NPS, Financeiro, Reuniões) | **barras horizontais** em cinza, uma por dimensão, ordenadas da pior para a melhor, com a **faixa-alvo** (80–100) desenhada ao fundo em `band.fill`; a dimensão abaixo de 60 recebe destaque e anotação                                                          | ranking + "onde está o problema" num olhar                     |
| Evolução temporal do health médio da carteira                         | **linha** em cinza para a média + linhas de referência 80/60/40; se o usuário selecionar um cliente no filtro, ele entra em `chart.accent` e a média fica em cinza; rótulo no último ponto                                                                       | tempo = linha; destaque = ênfase                               |
| Filtros (classe, plano, segmento, porte, status, período)             | uma **linha de filtros acima** de todos os gráficos da aba; todos os gráficos respondem ao mesmo filtro                                                                                                                                                          | filtro por gráfico confunde                                    |

### 4.3 Visão individual do cliente (§40)

| Elemento                                                                          | Visual                                                                                                                                                                                                                                        | Por quê                                        |
| --------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------- |
| Cabeçalho (Nome, Plano, Contrato, MRR, Health, Risk, Priority, Confiança)         | **texto simples** em linha; Health com pílula da classe; Confiança separada ("Health: 48/100 — Risco · Confiança: 91 %")                                                                                                                      | §25 e §58: score sempre com classe e confiança |
| Os 10 scores de métrica (Visão geral)                                             | **barras horizontais** ordenadas do pior para o melhor, cinza; a faixa da classe do cliente ao fundo; as métricas que mais puxam o score para baixo (maior `contribution` negativa) em `chart.accent` com a `human_explanation` como anotação | responde "por quê"                             |
| Tendência de cada métrica (abas Atendimento, SLA, Uso, NPS, Financeiro, Reuniões) | **linha** do cliente em `chart.accent`, **média da carteira em cinza**, rótulo no último ponto, faixas de threshold ao fundo; título dinâmico ("Uso caiu 19 % em relação ao baseline")                                                        | tempo = linha; ênfase no cliente               |
| Métricas N/A (reuniões previstas = 0, NPS sem resposta)                           | texto "N/A — sem reunião prevista no período", sem barra                                                                                                                                                                                      | §21/§22: ausência não é zero                   |
| Evidências                                                                        | **lista** ordenada por contribuição, cada item com valor atual, baseline e delta em texto                                                                                                                                                     | é leitura, não gráfico                         |
| Recomendações                                                                     | **lista** com status                                                                                                                                                                                                                          | idem                                           |
| Histórico / timeline                                                              | **linha** do overall_health com marcadores nos eventos (nova versão do modelo, importação, alerta), anotação no evento selecionado                                                                                                            | tempo + contexto                               |

### 4.4 Calibração (§43)

| Elemento                                                                                       | Visual                                                                                                                                                                                                                                                                                          | Por quê                                                 |
| ---------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------- |
| Janela, cancelamentos analisados, precision, recall, FPR, lead time, precision@5, precision@10 | **texto simples**, 8 números em duas linhas, cada um com a definição no tooltip                                                                                                                                                                                                                 | são números de consulta                                 |
| Comparação entre janelas (30/60/90 dias)                                                       | **tabela** (janela × métrica) — e, se ajudar, barras horizontais só para precision@10                                                                                                                                                                                                           | consulta                                                |
| Peso atual → peso sugerido por métrica                                                         | **tabela** (Métrica, Peso atual, Peso sugerido, Importância histórica, Mudança sugerida) **+ slopegraph**: duas colunas verticais (Atual / Sugerido), uma linha por métrica; sobe = `chart.accent`, desce = `chart.accentSoft`, sem mudança = cinza; rótulo direto com nome e % nas duas pontas | antes → depois por item é o caso clássico do slopegraph |
| Importância histórica                                                                          | barra horizontal cinza dentro da tabela (mesma escala para todas)                                                                                                                                                                                                                               | comparação rápida sem sair da tabela                    |

### 4.5 Configurador de métricas (§41) e SLA (§42)

Sem gráfico. Tabelas editáveis, e um **preview em texto** do cálculo ("SLA 120 min · meta 10 % → 12 min ·
consumo 65 % → health 42"). A soma dos pesos aparece como número com a classe em texto ("Total: 97 % —
faltam 3 %"), nunca como medidor circular.

---

## 5. Gráfico de forecast priorizado (ajuste A2)

O gráfico principal da aba "Em risco". Responde de uma vez: **quem** (ordem), **quanto** (health
atual), **para onde vai** (projeção) e **por quê** (evidência).

### 5.1 O que ele mostra

- **Linhas**: clientes ordenados por `priority_score` decrescente (o primeiro é o primeiro a ligar).
  Padrão: os 10 primeiros; controle "mostrar mais" até 25; acima disso, tabela.
- **Eixo X**: health 0–100, com **linhas de referência verticais em 40, 60 e 80** e o nome da
  classe escrito acima de cada faixa (Crítico · Risco · Atenção · Normal). As faixas vêm da
  configuração da organização (§7), não são fixas.
- **Por cliente**: um **dumbbell / seta**: ponto do **health atual** (cinza forte,
  `chart.neutralStrong`) ligado por um segmento ao ponto do **health projetado** para o próximo
  período. A seta aponta para onde o cliente vai.
- **Destaque em cor** (`chart.accent`) **só** para quem **cruza para Risco ou Crítico** no período
  projetado vindo de uma classe melhor. Quem já está em Crítico e continua caindo fica em cinza
  (a posição já conta a história); quem melhora fica em cinza com a seta para a direita.
- **Rótulo direto** à esquerda: `#posição · Nome · MRR`. À direita: **a principal evidência**
  (`human_explanation` do driver com maior contribuição negativa).
- **Sem projeção** (histórico insuficiente): só o ponto atual, com o texto "sem histórico — sem
  projeção" no lugar da seta e o ícone de confiança baixa.
- **Título dinâmico** com o "e daí?": "3 clientes devem cruzar para Risco ou Crítico no próximo
  período". Zero cruzamentos → "Nenhum cliente deve mudar de faixa no próximo período".
- **Subtítulo obrigatório**: "Projeção por tendência dos últimos N períodos — não é modelo preditivo".
- **Interação**: hover/foco mostra o tooltip (health atual, projetado, classe, confiança, evidência,
  MRR); **clique na linha leva a `/clients/:id`**.
- **Irmão em tabela**: é a própria tabela de ranking da aba (4.1), que ganha as colunas "Health
  projetado" e "Confiança da projeção".

### 5.2 Como a projeção é calculada

Isto é uma **heurística de tendência**, não um modelo preditivo. A UI rotula assim, sempre.

```text
janela        = trend_window da organização (padrão 3 períodos — §10)
histórico     = últimos `janela` valores de overall_health do cliente (client_score_snapshots, por period_end)
slope         = inclinação da regressão linear simples sobre esses pontos (pontos por período)
                (com 2 pontos, é o delta simples)
projetado     = clamp(health_atual + slope, 0, 100)

confiança da projeção:
  pontos disponíveis < 2                      → sem projeção (healthProjected = null), confiança "low"
  2 ≤ pontos < janela                         → projeta, confiança "low"
  pontos ≥ janela e analysis_confidence ≥ 70  → "high"
  caso contrário                              → "medium"

cruza para baixo = classe(projetado) ∈ {Risco, Crítico} e classe(projetado) é pior que classe(atual)
```

A projeção **nunca** usa dado futuro nem status de cancelamento (§59). Quando os thresholds mudam,
a classe projetada é recalculada com os thresholds vigentes.

### 5.3 Exemplo em ASCII

```text
3 clientes devem cruzar para Risco ou Crítico no próximo período
Projeção por tendência dos últimos 3 meses — não é modelo preditivo · ○ atual  ● projetado  ═ deslocamento

                            0        40        60        80       100
                            |Crítico  | Risco   | Atenção | Normal |
 1  Alfa Ltda    R$ 12,0 mil|  ●◀══○  |         |         |        |  Chamados críticos +180 % em 3 meses
 2  Beta S.A.    R$  8,5 mil|         |    ●◀═══|══○      |        |  SLA caiu 24 p.p.                   ◀ destaque
 3  Gama ME      R$  3,2 mil|      ●◀═|═○       |         |        |  Taxa de reabertura dobrou           ◀ destaque
 4  Delta Corp   R$ 20,0 mil|         |         |  ○▶●    |        |  2 reuniões previstas não ocorreram
 5  Épsilon      R$  6,1 mil|         |   ●◀════|═══○     |        |  Uso 19 % abaixo do baseline         ◀ destaque
 6  Ômega        R$  1,1 mil|         |         |         |  ○     |  sem histórico — sem projeção (confiança baixa)

 (linhas 2, 3 e 5 em chart.accent; as outras em cinza; clique em qualquer linha abre o cliente)
```

Alfa já está em Crítico e continua caindo: fica em cinza, mas é o nº 1 pela prioridade (risco alto
e MRR alto). Delta melhora: seta para a direita, cinza. Ômega não tem histórico: só o ponto.

### 5.4 Estrutura de dados esperada

Fica em `packages/shared/src/dashboard/forecast.ts` (tipos) e é o retorno de `GET /dashboard/risk`
no campo `forecast`. O cálculo da projeção é puro e vive em `packages/engine/src/scoring/forecast.ts`.

```ts
import type { HealthClass, PriorityClass } from '../scoring/classes';

/** Uma linha do gráfico de forecast priorizado (um cliente). */
export interface ForecastRow {
  clientId: string;
  clientName: string;
  /** Valor mensal do contrato (MRR), na moeda abaixo. */
  mrr: number;
  currency: string;

  /** Ordena a lista (decrescente). 0–100. */
  priorityScore: number;
  priorityClass: PriorityClass;

  /** Health atual (0–100) e sua classe pelos thresholds vigentes. */
  healthCurrent: number;
  currentClass: HealthClass;

  /** Health projetado para o próximo período. `null` = histórico insuficiente. */
  healthProjected: number | null;
  projectedClass: HealthClass | null;

  /** Inclinação usada (pontos de health por período). `null` quando não há projeção. */
  slopePerPeriod: number | null;
  /** Janela configurada (N) e quantos períodos existiam de fato. */
  trendWindow: number;
  periodsAvailable: number;

  /** analysis_confidence do último snapshot (0–100). */
  confidence: number;
  projectionConfidence: 'low' | 'medium' | 'high';

  /** true quando a classe projetada é Risco ou Crítico e é pior que a atual. É o que recebe cor. */
  crossesDown: boolean;

  /** human_explanation do driver com maior contribuição negativa. */
  topEvidence: string;
  /** period_end do snapshot atual (ISO 8601). */
  periodEnd: string;
}

/** Payload do gráfico: linhas + o que o título precisa. */
export interface ForecastChartData {
  rows: ForecastRow[];
  /** Thresholds vigentes, para desenhar as linhas de referência. */
  thresholds: { attention: number; risk: number; critical: number }; // padrão 80 / 60 / 40
  trendWindow: number;
  periodLabel: string; // ex.: "mês"
  /** Quantas linhas têm crossesDown = true (vira o título). */
  crossingCount: number;
}
```

`HealthClass` = `"normal" | "attention" | "risk" | "critical"` e `PriorityClass` =
`"P0" | "P1" | "P2" | "P3"`, ambos em `packages/shared`.

### 5.5 Checklist antes de dar o gráfico por pronto

- [ ] ordem = `priority_score` desc, e o nº da posição aparece no rótulo;
- [ ] cor só em `crossesDown`; o resto cinza;
- [ ] classe sempre escrita em texto (no eixo e no tooltip);
- [ ] subtítulo "projeção por tendência — não é modelo preditivo" presente;
- [ ] título muda com os dados (0, 1, N cruzamentos);
- [ ] clique leva a `/clients/:id`; foco por teclado funciona;
- [ ] "Ver como tabela" mostra as mesmas linhas com os mesmos números;
- [ ] tokens vêm de `chart-theme.ts`, nenhum hex no componente;
- [ ] modo escuro conferido de olho (rótulos legíveis, faixas visíveis);
- [ ] abriu no navegador e olhou: sem rótulo cortado, sem sobreposição, sem barra de rolagem dentro do card.
