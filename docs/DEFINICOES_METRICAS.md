# INOVAAPPS — Definições Consolidadas de Métricas

> Documento do time. É a **fonte oficial** das 10 métricas e das fórmulas.
> Implementação: preset em [`apps/api/src/db/seed/presets/globalsys-v1.ts`](../apps/api/src/db/seed/presets/globalsys-v1.ts),
> carga pelo comando `pnpm --filter @inovaapss/api seed:globalsys`.
> Em caso de divergência com [SPEC.md](SPEC.md), este documento vence para métricas e fórmulas.

## 1. Objetivo do modelo

Avaliar a saúde dos clientes, identificar sinais de deterioração e priorizar quem precisa de atenção primeiro. Três conceitos separados:

1. **Saúde** — quão saudável está a relação com o cliente.
2. **Risco** — derivado da saúde.
3. **Prioridade** — ordem de atuação, combinando risco e impacto comercial.

A GlobalSys é a primeira configuração; o motor é genérico e permite que outras empresas configurem métricas, pesos, regras, limites, fórmulas e gatilhos próprios.

## 2. Escala principal

Saúde de **0 a 100** (100 = saudável, 0 = extremamente preocupante).

| Health Score | Classificação |
| -----------: | ------------- |
|       80–100 | Normal        |
|        60–79 | Atenção       |
|        40–59 | Risco         |
|         0–39 | Crítico       |

Faixas configuráveis.

## 3. Risco

```text
risk_score = 100 - health_score
```

## 4. Componentes de cada métrica

```text
metric_health = current_health * 0,45 + trend_health * 0,35 + persistence_health * 0,20
```

## 5. Situação atual, tendência e persistência

- **Atual** — como a métrica está agora.
- **Tendência** — janela de 3 períodos. Exemplo: uso 92 → 84 → 73 → 61 está piorando.
- **Persistência** — 1 mês ruim pode ser oscilação; 3 meses seguidos é deterioração.

## 6. Métricas GlobalSys — versão inicial

| Ordem | Métrica                             |     Peso | Normalização implementada                 | Gatilho                        |
| ----: | ----------------------------------- | -------: | ----------------------------------------- | ------------------------------ |
|     1 | Chamados críticos                   |      18% | desvio do histórico + faixas absolutas    | 3+ críticos por 2 meses        |
|     2 | Tempo de resolução × SLA contratado |      16% | razão sobre a meta (SLA do contrato)      | saúde ≤ 50                     |
|     3 | Uso da plataforma                   |      14% | desvio do histórico + faixas absolutas    | uso abaixo de 60% por 3 meses  |
|     4 | Cumprimento de SLA                  |      12% | faixas em 70/80/90/95                     | SLA abaixo de 70%              |
|     5 | Chamados reabertos                  |      10% | faixas sobre a taxa                       | —                              |
|     6 | Reclamações formais                 |       9% | faixas em 0/1/2+                          | reclamação em 2 meses seguidos |
|     7 | Chamados abertos                    |       7% | desvio do histórico do próprio cliente    | —                              |
|     8 | Atraso de pagamento                 |       6% | faixas em 0/5/15/30 dias                  | atraso acima de 30 dias        |
|     9 | Reuniões não realizadas             |       5% | linear sobre a taxa; N/A se previstas = 0 | —                              |
|    10 | Insatisfação / NPS                  |       3% | linear de 0 a 10; N/A se não respondeu    | —                              |
|       | **Total**                           | **100%** |                                           |                                |

Pesos iniciais, a calibrar com o histórico.

## 7 a 16. Detalhe de cada métrica

**1. Chamados críticos (18%)** — concentração, crescimento e recorrência de chamados severos. Dados: `chamados_criticos`, `chamados_abertos`. Taxa = críticos / abertos × 100. Avaliar quantidade, média histórica, crescimento, proporção, tendência e persistência. Maior é pior.

**2. Tempo de resolução × SLA contratado (16%)** — o SLA sai de cliente + contrato + plano + severidade + tipo, nunca um valor global fixo. Além do SLA contratual existe a **Meta Operacional Sugerida** (percentual do SLA ou minutos absolutos), que não altera o contrato e serve para antecipar a atuação. Consumo do SLA = decorrido / SLA × 100; consumo da meta = decorrido / meta × 100. Saúde = 100 menos (60% do consumo do SLA + 40% do consumo da meta), ambos limitados a 100. Pesos 60/40 configuráveis.

**3. Uso da plataforma (14%)** — `uso_plataforma_pct`. Não olhar só o valor absoluto: 93 → 88 → 80 → 71 → 62 é preocupante; 65 → 66 → 64 → 65 → 66 é estável. Maior é melhor.

**4. Cumprimento de SLA (12%)** — `pct_sla_cumprido`, `chamados_dentro_sla`. Desempenho agregado, diferente da métrica 2 que olha o prazo dos chamados. Maior é melhor.

**5. Chamados reabertos (10%)** — taxa = reabertos / abertos × 100. Maior é pior.

**6. Reclamações formais (9%)** — `reclamacoes_formais`. Avaliar quantidade, recorrência, crescimento e sequência de meses. Maior é pior.

**7. Chamados abertos (7%)** — `chamados_abertos`. Comparar com o padrão do próprio cliente: média de 4 por mês saltando para 13 é o sinal. Maior é pior.

**8. Atraso de pagamento (6%)** — `dias_atraso_pagamento`. Avaliar atual, média, maior atraso, recorrência e tendência. Maior é pior.

**9. Reuniões não realizadas (5%)** — taxa = (previstas menos realizadas) / previstas × 100. Se previstas = 0, o resultado é **N/A**, nunca saudável automaticamente. Maior é pior.

**10. Insatisfação / NPS (3%)** — `respondeu`, `nota_nps`. "Não respondeu" não é dado ausente genérico nem vira nota zero; a sequência sem resposta é analisada. Com nota, maior é melhor.

## 17. Evitar dupla contagem

Sem peso próprio: chamados dentro do SLA (já compõem o cumprimento), classificação de NPS (derivada da nota), reuniões previstas e realizadas separadas (formam uma única métrica).

## 18. Score geral

```text
overall_health = soma(metric_health x peso) / soma(peso disponível)
```

## 19. Confiança

Mostrada separada da saúde. Dado ausente **nunca** é considerado saudável. A confiança cai quando faltam métricas, os dados estão desatualizados ou não há histórico suficiente.

## 20 e 21. Prioridade

```text
priority_score = risk_score * 0,70 + commercial_impact_score * 0,30
```

Impacto comercial considera valor do contrato, plano, importância estratégica, porte e outros critérios configuráveis.

| Priority Score | Classe        |
| -------------: | ------------- |
|         85–100 | P0 — Imediata |
|          70–84 | P1 — Alta     |
|          50–69 | P2 — Média    |
|           0–49 | P3 — Normal   |

## 22. Gatilhos críticos

Peso contribui para o score; gatilho gera ação imediata. Um gatilho pode criar alerta, elevar a prioridade, definir prioridade mínima ou gerar ação recomendada.

## 23. Evidências

Cada evidência traz: métrica, valor atual, baseline, variação, tendência, health score, peso, contribuição e explicação em texto. Exemplo: "SLA caiu 24 pontos percentuais em 3 meses."

## 24. Recomendações

Ação por métrica. SLA: revisar causas do estouro. Reabertura: análise de causa raiz. Uso: validar adoção. NPS: contato de relacionamento. Reuniões: reagendar acompanhamento.

## 25. Modos de peso

Manual, Assistido (o sistema sugere, a empresa aprova) e Automático. Preferencial: **Assistido**.

## 26. Calibração com os 22 cancelamentos

Analisar 1, 2 e 3 meses antes de cada cancelamento: quais métricas pioraram, quando, combinações recorrentes, falsos positivos e negativos, antecedência. Medir precision, recall, false positive rate, lead time, precision@5 e precision@10, nunca só accuracy.

## 27. Regra contra vazamento de dados

Ao calcular o risco num período histórico, usar apenas dados disponíveis até ali. Campos de cancelamento servem para validação, backtest e calibração, nunca como entrada do score.

## 28. Sistema genérico

A GlobalSys é apenas um preset. Outra empresa pode adicionar, remover e reordenar métricas, alterar peso, fórmula, direção, limites, faixas, periodicidade e gatilhos, em qualquer quantidade.

## 29 a 31. Tipos, sentido e cadastro mínimo

Tipos: Tempo, Percentual, Quantidade, Frequência, Financeiro, Variação, Nota/Score, Binário, Categoria, Data/Prazo.

Sentido: maior é melhor, maior é pior ou faixa-alvo.

Cadastro mínimo: nome, descrição, categoria, tipo, unidade, direção, peso, fonte, periodicidade, método de cálculo, estratégia de normalização, limites, faixas, meta, gatilhos, ativa ou inativa, e os pesos de situação atual, tendência e persistência.

## 32. Versionamento

Configurações versionadas (GlobalSys v1, v2...). Alterar peso, faixa ou fórmula não apaga a configuração anterior, e cada score histórico sabe qual versão o gerou.

## 33. Resumo matemático

```text
metric_health   = current * 0,45 + trend * 0,35 + persistence * 0,20
overall_health  = soma(metric_health * peso) / soma(peso disponível)
risk_score      = 100 - overall_health
priority_score  = risk * 0,70 + impacto comercial * 0,30

sla_consumption    = decorrido / sla_contratual * 100
operational_target = sla_contratual * percentual   (ou minutos absolutos)
target_consumption = decorrido / meta_operacional * 100
sla_health         = clamp(100 - (min(sla_consumption,100) * 0,60
                                + min(target_consumption,100) * 0,40), 0, 100)

reopen_rate          = reabertos / abertos * 100
critical_ticket_rate = criticos / abertos * 100
missed_meeting_rate  = (previstas - realizadas) / previstas * 100   (N/A se previstas = 0)
```

## 34. Fluxo

```text
Dado bruto -> cálculo da métrica -> normalização 0-100 ->
(atual + tendência + persistência) -> health da métrica -> peso ->
health do cliente -> risco -> confiança -> impacto comercial -> prioridade ->
evidências -> ação recomendada
```

A arquitetura permanece configurável: novas empresas usam métricas completamente diferentes sem alterar o motor central.
