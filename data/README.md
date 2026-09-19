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

Uso no projeto: importador (`packages/importer`, Etapa 7), preset GlobalSys v1 (Etapa 6) e
calibração/backtest com os 22 cancelamentos (Etapa 12).
