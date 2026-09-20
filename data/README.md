# Base de dados do desafio

`INOVAAPPS_base_de_dados.xlsx` — base fornecida pelo desafio. O próprio arquivo declara, na aba
**Leia-me**: _"Dados fictícios. Nenhuma informação real de cliente."_ Por isso ela é versionada aqui.

| Aba                  | Conteúdo                                                                                                                                        |
| -------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| `Leia-me`            | Contexto e três avisos importantes (leia antes de usar)                                                                                         |
| `dicionario`         | Significado de cada campo                                                                                                                       |
| `clientes`           | 80 clientes: segmento, porte, plano, valor mensal, SLA contratado (h), início do contrato                                                       |
| `atendimento_mensal` | 1.295 linhas, uma por cliente por mês (jan/2025 a jun/2026): chamados, SLA, tempo de resolução, reclamações, uso, atraso de pagamento, reuniões |
| `pesquisas_nps`      | 422 pesquisas trimestrais (`respondeu = 0` com nota vazia é "convidado e não respondeu", não dado faltante)                                     |
| `situacao_clientes`  | 58 ativos e 22 cancelados, com o mês do cancelamento                                                                                            |

Avisos do próprio arquivo: quem cancelou não tem linhas depois do mês da saída (proposital); há clientes
que pioraram bastante e não cancelaram — a pior foto de um mês não separa risco de ruído.

## O que já está conferido

A coerência entre as abas é verificada por teste (`packages/importer/src/presets/globalsys-xlsx.test.ts`),
não presumida: as quatro abas falam dos mesmos 80 clientes; há uma linha por cliente por mês, sem
repetição; ninguém tem atendimento nem pesquisa depois do mês do cancelamento; `pct_sla_cumprido` bate
com `chamados_dentro_sla / chamados_abertos` e só vem vazio quando não houve chamado; nota e
classificação do NPS combinam.

Números que a base fecha e que valem como referência ao ler qualquer tela:

| Medida                                        |      Valor |
| --------------------------------------------- | ---------: |
| Soma dos 80 contratos                         | R$ 982.964 |
| MRR que segue recorrendo (58 ativos)          | R$ 707.998 |
| Valor mensal que saiu com os 22 cancelamentos | R$ 274.966 |
| Pesquisas respondidas (de 422 convites)       |        338 |
| Nota média de quem respondeu                  |       7,11 |
| NPS agregado (promotores − detratores)        |      −6,80 |

**Qual desses números vai para cada tela** está em [docs/DADOS.md](../docs/DADOS.md) — a diferença
entre "soma dos contratos" e "MRR" é a origem da maior parte das divergências que já apareceram aqui.

Uso no projeto: importador (`packages/importer`, Etapa 7), preset GlobalSys v1 (Etapa 6) e
calibração/backtest com os 22 cancelamentos (Etapa 12).
