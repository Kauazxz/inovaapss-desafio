# SLA Engine — SLA contratual, meta operacional e health por chamado

Implementa a Métrica 2 do preset GlobalSys ("Tempo de resolução × SLA contratado + status/plano",
[SPEC.md](SPEC.md) §14 e §70) de forma genérica: qualquer organização configura suas políticas.
Código em `packages/engine/src/sla/` (`@inovaapss/engine`), puro — a API (Etapa 5) lê
`sla_policies` e `tickets` e chama estas funções. Cada número aqui é verificado por
`packages/engine/src/sla/sla.test.ts`.

---

## 1. Conceitos (e por que são diferentes)

| Conceito                      | O que é                                                                                      | Muda o contrato? |
| ----------------------------- | -------------------------------------------------------------------------------------------- | ---------------- |
| **SLA contratual**            | `contractual_sla_minutes` da política: o prazo acordado com o cliente                        | é o contrato     |
| **Meta operacional sugerida** | prazo interno mais curto para agir antes do estouro (`PERCENT_OF_SLA` ou `ABSOLUTE_MINUTES`) | **não**          |
| **Consumo**                   | quanto do prazo já passou (%)                                                                | —                |
| **Health do chamado**         | 0–100 a partir dos dois consumos                                                             | —                |

Estourar a meta operacional **não** é estourar o contrato: o resultado traz `breachedContract` e
`breachedOperationalTarget` separados.

---

## 2. SLA aplicável — `resolveApplicableSla(policies, { planId, severityId, ticketTypeId, at })`

Uma política tem `planId`, `severityId` e `ticketTypeId`; **`null` é coringa** (vale para qualquer
valor). Vence a política **mais específica** (mais campos casados); em empate, a de `validFrom` mais
recente. Políticas inativas ou fora da validade (`validFrom`/`validTo` comparados com `at`,
normalmente `opened_at`) não entram. Sem candidata → `null` (chamado sem SLA → health N/A).

Exemplo: políticas `A` (plano premium + severidade crítica, 120 min) e `B` (tudo coringa, 480 min).
Chamado premium/crítico → `A`; chamado básico/baixo → `B`.

---

## 3. Meta operacional — `operationalTargetMinutes(policy)`

```text
PERCENT_OF_SLA   → contractual_sla_minutes × operational_target_value / 100
ABSOLUTE_MINUTES → operational_target_value
```

| SLA contratual | Tipo             | Valor | Meta operacional |
| -------------: | ---------------- | ----: | ---------------: |
|        120 min | PERCENT_OF_SLA   |    10 |       **12 min** |
|         60 min | PERCENT_OF_SLA   |    40 |       **24 min** |
|        480 min | ABSOLUTE_MINUTES |   240 |      **240 min** |

Metas por plano/severidade são configuração (`sla_policies`), nunca constantes no código (§14,
§65). SLA ou meta ≤ 0 → `EngineConfigError`.

---

## 4. Tempo decorrido — `elapsedMinutes(ticket, now?)`

| Status                                                        | Tempo decorrido                                     |
| ------------------------------------------------------------- | --------------------------------------------------- |
| `OPEN`, `IN_PROGRESS`, `WAITING_CUSTOMER`, `WAITING_INTERNAL` | `now − opened_at` (exige `now`)                     |
| `RESOLVED`, `CLOSED`                                          | `resolved_at − opened_at` (ou `closed_at` na falta) |
| `CANCELLED`                                                   | não avaliado (`null`)                               |

`now` entra por parâmetro: o motor não lê o relógio. Datas inválidas ou ausentes → `null` com o
motivo em português.

---

## 5. Consumo e health — `contractSlaConsumption`, `operationalTargetConsumption`, `ticketSlaHealth`

```text
contract_sla_consumption       = elapsed / contractual_sla_minutes × 100
operational_target_consumption = elapsed / operational_target_minutes × 100

weighted_consumption = min(contract, 100) × 0,60 + min(operational, 100) × 0,40
ticket_sla_health    = clamp(100 − weighted_consumption, 0, 100)
```

Os pesos 60/40 são `DEFAULT_TICKET_SLA_WEIGHTS`, configuráveis por chamada (`weights`). Se um dos
consumos não existe (política sem meta), o peso vai todo para o outro.

Exemplos verificados (SLA 120 min, meta 10 % = 12 min):

| Decorrido | Consumo contratual | Consumo da meta | Health | Estourou contrato? | Estourou meta? |
| --------: | -----------------: | --------------: | -----: | ------------------ | -------------- |
|     6 min |                5 % |            50 % | **77** | não                | não            |
|    60 min |               50 % |           500 % | **30** | não                | **sim**        |
|   180 min |              150 % |          1500 % |  **0** | **sim**            | sim            |

Com pesos 50/50, o chamado de 60 min fica em **25**; só com o contratual (`{contract: 1, operational: 0}`), em **50**.

---

## 6. Avaliação completa — `evaluateTicketSla(ticket, policies, { now, weights })`

Junta tudo em um `TicketSlaResult`: política usada, SLA contratual, meta em minutos, decorrido,
os dois consumos, health, os dois estouros, `isOpen` e `reason` (quando N/A). `evaluateTicketsSla`
faz o mesmo para uma lista.

---

## 7. Agregação por cliente — `aggregateClientSla(results, { method, openOnly })`

Transforma os chamados de um cliente no valor da Métrica 2:

- `AVERAGE` (padrão): média dos healths avaliáveis;
- `WORST`: o pior chamado;
- `openOnly`: só chamados em andamento.

Chamados cancelados, sem política ou sem data ficam de fora (`skippedTickets`). Sem chamado
avaliável → `health: null` (N/A; a métrica não entra no overall e reduz a confiança). O resultado
traz também `breachedContractCount`, `breachedOperationalCount` e o pior chamado — insumo direto
para gatilhos como "ticket crítico > 120 % do SLA" (§27) e para a evidência.

Exemplo: quatro chamados avaliáveis com healths 77, 30, 77 e 82,5 → média **66,63**, pior **30**
(`late`), 1 estouro de meta, 0 de contrato.

---

## 8. Como a Etapa 5 (API) usa isto

1. `sla_policies` da organização → `SlaPolicy[]` (ids de plano/severidade/tipo, validade).
2. Cada `ticket` → `SlaTicket` (status, datas, plano do contrato, severidade, tipo).
3. `evaluateTicketsSla(tickets, policies, { now: new Date().toISOString() })` para `GET /tickets/:id/sla`
   e para o recálculo.
4. `aggregateClientSla(...)` por cliente e período → valor da métrica `resolution_vs_sla`
   (`metric_values` com `source = DERIVED`), que o scoring normaliza como qualquer outra métrica.
5. O preview do configurador de SLA (§42) chama `operationalTargetMinutes` e `ticketSlaHealth`
   com valores de exemplo — mesma função, mesmo número.
