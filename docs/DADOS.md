# Regras de leitura dos dados

Este documento responde a uma pergunta só: **quem entra em cada número que a tela mostra.**

Ele existe porque os erros mais caros deste produto não são de cálculo — o motor é testado e as
fórmulas estão em [SCORING.md](SCORING.md). Os erros caros são de **população**: somar um contrato
que já acabou, contar duas vezes o cliente que trocou de contrato, ou tirar a média de uma carteira
que nos meses antigos só tinha os clientes que viriam a cancelar. O número sai com cara de certo e
ninguém desconfia.

A base do desafio (`data/INOVAAPPS_base_de_dados.xlsx`) serve de referência em todos os exemplos:
80 clientes, **58 ativos e 22 cancelados**, de jan/2025 a jun/2026.

---

## 1. MRR é receita que recorre, não soma de contratos

| Pergunta                                  | Resposta                                  | Na base do desafio |
| ----------------------------------------- | ----------------------------------------- | ------------------ |
| Quanto vale a carteira hoje? (`kpis.mrr`) | contratos **vigentes de clientes ativos** | **R$ 707.998**     |
| Quanto já foi contratado no período?      | os 80 contratos                           | R$ 982.964         |
| Quanto saiu com os cancelamentos?         | os 22 contratos encerrados                | R$ 274.966         |

Cliente cancelado entra como **zero** no MRR, não com o valor do contrato que acabou. Somar tudo
inflaria a carteira em 39 % — e o KPI passaria a crescer a cada cancelamento, porque o contrato
encerrado continuaria contando.

A variação do KPI (`delta`) é o que se perdeu no último período: a soma dos contratos que
terminaram naquele mês.

## 2. A distribuição por classe é a foto de HOJE

Só clientes **ativos** entram nas barras Normal / Atenção / Risco / Crítico.

O snapshot de quem cancelou fica parado no mês da saída — é assim que a planilha vem, de propósito
("um cliente que cancelou não tem linhas depois do mês da saída"). Contar esse snapshot na
distribuição de hoje é exibir a foto de um cliente que pode ter ido embora há 18 meses. Na base do
desafio isso muda a conversa: **Risco 10 e Crítico 2** viram _Risco 19 e Crítico 13_ — e a aba
"Geral" passa a dizer que 32 clientes precisam de atenção, enquanto a aba "Em risco", que já
filtra ativos, lista 12.

A mesma regra vale para a saúde por dimensão e para o MRR de cada classe.

## 3. A linha do tempo compara a carteira com ela mesma

Cada ponto da evolução é a média de **quem estava na carteira naquele mês** — quem já tinha
cancelado não está lá, e quem ainda não tinha cancelado está. Por isso o recálculo pontua o
**histórico inteiro** de cada cliente, não os últimos N períodos.

Limitar a janela recalcula "os últimos N meses **de cada cliente**", e como quem cancelou parou de
ter dados no mês da saída, cada cliente fica coberto num intervalo diferente. O gráfico vira a
média de populações que não se comparam. Com a janela de 6 que o projeto usava, a linha do tempo da
base do desafio ficava assim:

| Período | Clientes no ponto | Destes, ativos hoje | Média |
| ------- | ----------------: | ------------------: | ----: |
| jan/25  |                 4 |               **0** |  77,7 |
| jun/25  |                 6 |               **0** |  47,4 |
| dez/25  |                12 |               **0** |  59,7 |
| jan/26  |                69 |                  58 |  66,0 |
| jun/26  |                58 |                  58 |  71,8 |

Todo o ano de 2025 era a média **exclusivamente de clientes que viriam a cancelar**, e o título
dinâmico do gráfico ("a média da carteira caiu X pontos") comparava 4 clientes condenados com 58
clientes ativos. Pontuando o histórico inteiro, a série fica honesta: 80 clientes em jan/25
(média 74,1) diminuindo até 58 em jun/26 (média 71,8), conforme os cancelamentos acontecem.

`RECALCULATE_PERIODS` continua existindo para encurtar a janela num recálculo pontual; sem ela, o
padrão é o histórico completo.

## 4. Um contrato por cliente em tudo que soma ou conta

`contracts` guarda o **histórico**. O banco só garante um contrato `active` por cliente; nada
impede vários `ended` — é o que acontece quando alguém encerra um contrato e cria outro, fluxo que
a própria tela de contratos oferece.

Um `leftJoin` direto em `contracts` devolve então N linhas do mesmo cliente, e quem lê isso passa a
contar o cliente N vezes e a somar o MRR N vezes. O subquery
[`currentContractSubquery`](../apps/api/src/shared/current-contract.ts) resolve o cliente em uma
linha só, escolhendo o contrato `active` e, na falta dele (cliente cancelado), o encerrado mais
recente. Usam-no o dashboard, a tela do cliente, os alertas e o recálculo — a tela de clientes já
fazia certo, e era por ela que a divergência aparecia.

## 5. "Clientes ativos" é a carteira, não o que o recálculo alcançou

O KPI conta clientes com `status = 'active'`. Contar só quem tem snapshot faria a aba "Em risco" e a
aba "Geral" darem números diferentes para o mesmo rótulo sempre que um cliente novo entrasse antes
do primeiro recálculo. Quem não tem snapshot fica de fora do **ranking** (não há o que ranquear),
mas continua sendo um cliente da carteira.

## 6. Ausência de dado nunca vira zero

Regras do documento de métricas que a carga e o importador aplicam já na entrada:

| Situação                                       | Valor gravado                     | Referência |
| ---------------------------------------------- | --------------------------------- | ---------- |
| Mês sem chamado                                | `pct_sla_cumprido` = **N/A**      | §15        |
| Nenhuma reunião prevista                       | reuniões não realizadas = **N/A** | §15        |
| Cliente convidado que não respondeu a pesquisa | `answered = false`, nota **N/A**  | §16, §22   |

N/A sai do cálculo do health e **reduz a confiança**; zero seria uma nota ruim inventada.

A classificação do NPS é **derivada da nota** (§17). O importador recusa a linha em que as duas se
contradizem — um "Promotor" com nota 3 mostraria na tela um cliente satisfeito com a nota de um
detrator.

## 7. O que está verificado, e onde

A coerência **entre as abas** da planilha é testada, não presumida:

- `packages/importer/src/presets/globalsys-xlsx.test.ts` — as quatro abas falam dos mesmos 80
  clientes; uma linha por cliente por mês; ninguém tem atendimento ou pesquisa depois do mês do
  cancelamento; `pct_sla_cumprido` bate com `chamados_dentro_sla / chamados_abertos` e só é vazio
  quando não houve chamado; nota e classificação do NPS combinam; os R$ 707.998 e os R$ 274.966.
- `apps/api/src/modules/dashboard/__tests__/dashboard.test.ts` — as regras 1, 2 e 5 acima, com um
  repositório em memória.

Rodando o motor sobre a base inteira, o modelo separa quem saiu: os 22 cancelados estavam com saúde
média **41,0** no mês da saída (20 deles em Risco ou Crítico), contra **71,8** dos 58 ativos em
jun/26.

## 8. Em aberto: "Tempo de resolução × SLA" e o plano do cliente

Não é um erro de leitura — é uma **calibração** a fazer (§26: "pesos iniciais, a calibrar com o
histórico"), e está aqui para não se perder.

A métrica 2 compara `tempo_medio_resolucao_h` com o SLA contratado. Na base, a saúde dela sai
praticamente decidida pelo plano:

| SLA contratado | Plano      | Saúde média da métrica | Meses com saúde 0 |
| -------------- | ---------- | ---------------------: | ----------------: |
| 6 h            | Enterprise |                **6,6** |        168 de 319 |
| 12 h           | Avançado   |                   30,1 |         80 de 401 |
| 24 h           | Essencial  |                   86,7 |                 0 |

Os mesmos clientes Enterprise aparecem com 80–90 % de `pct_sla_cumprido`. Ou seja: o tempo **médio**
(que poucos chamados muito longos puxam para cima) e o **percentual dentro do prazo** contam
histórias diferentes, e a métrica 2 — 16 % do peso, a segunda maior — vira quase um imposto por
plano em vez de um sinal de comportamento. Vale decidir, na calibração, entre usar a mediana, usar o
percentual de chamados acima do SLA, ou baixar o peso. Trocar a normalização sem essa decisão mexeria
no score de toda a carteira.
