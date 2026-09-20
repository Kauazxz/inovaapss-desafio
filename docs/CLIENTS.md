# Clientes, planos e contratos (Etapa 2)

Como a carteira da organização é cadastrada: os clientes monitorados, os planos de atendimento e
os contratos que ligam um ao outro. Regras na [SPEC.md](SPEC.md) §4 (modelo multiempresa), §36
(tabelas `portfolio_clients`, `plans`, `contracts`), §37 (rotas) e §61 (paginação e filtros).

---

## 1. Modelo

```text
ORGANIZATION ──► PORTFOLIO CLIENTS ──► CONTRACTS ──► PLANS
                 (empresa monitorada)   (valor mensal,  (nível de
                                         datas, SLA)     atendimento)
```

| Tabela              | Campos principais                                                                                                                                                                                           | Regras                                                                                                           |
| ------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| `portfolio_clients` | `external_code` (código no sistema de origem, ex. `cliente_id` da planilha), `name`, `segment`, `size`, `status` (`active` · `inactive` · `cancelled` · `archived`), `strategic_importance` (1–5, padrão 3) | `external_code` único por organização; `strategic_importance` entre 1 e 5 (check)                                |
| `plans`             | `name`, `description`                                                                                                                                                                                       | nome único por organização (sem diferenciar maiúsculas na API)                                                   |
| `contracts`         | `portfolio_client_id`, `plan_id` (opcional), `monthly_value` numeric(12,2), `currency` (padrão `BRL`), `start_date`, `end_date`, `status` (`active` · `ended` · `suspended`), `contracted_sla_hours`        | **um contrato `active` por cliente** (índice parcial `contracts_one_active_per_client`); `end_date ≥ start_date` |

Todas têm `organization_id` (tenant), `created_at` e `updated_at`, RLS ligado (membro lê;
owner/admin/analyst escreve; owner/admin apaga) e os schemas Drizzle em
`apps/api/src/db/schema/clients.ts` e `contracts.ts`. `contracted_sla_hours` é o SLA contratual
simples (`sla_contratado_h`); a Etapa 5 refina em `sla_policies` por severidade e tipo.

## 2. Regras de negócio

- **Contrato único ativo.** Criar um contrato `active` (ou reativar um encerrado) encerra o ativo
  anterior do cliente: ele vira `ended` com `end_date` = data de início do novo (se não tinha
  término, ou se o término era posterior). Feito numa transação no repository; o índice parcial é a
  segunda barreira (409 `ACTIVE_CONTRACT_EXISTS` numa corrida).
- **Arquivar, nunca apagar.** `DELETE /clients/:id` muda o status para `archived`. O cliente some
  da lista padrão (volta com `status=archived`) e o histórico de métricas e scores fica.
- **Isolamento.** Toda query filtra por `organization_id` do tenant; um cliente, plano ou contrato
  de outra organização responde 404.
- **Papéis.** `viewer` só lê; `analyst`, `admin` e `owner` cadastram e editam.

## 3. Rotas (`/api/v1`)

| Rota                          | Guardas                                        | Notas                                                                                                                                                                                                                                                                                                                         |
| ----------------------------- | ---------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET /clients`                | auth + tenant                                  | `page`, `pageSize`, `search` (nome ou código), `sort` (`name`, `externalCode`, `segment`, `size`, `status`, `strategicImportance`, `planName`, `monthlyValue`, `createdAt`), `order`; filtros `status`, `segment`, `size`, `plan` (nome do plano do contrato ativo), `strategic_importance`. Sem `status`, esconde arquivados |
| `GET /clients/filter-options` | auth + tenant                                  | segmentos, portes, planos e status existentes na organização                                                                                                                                                                                                                                                                  |
| `POST /clients`               | + owner/admin/analyst                          | 409 `EXTERNAL_CODE_TAKEN`                                                                                                                                                                                                                                                                                                     |
| `GET /clients/:id`            | auth + tenant                                  | `{ client }` com `activeContract` (id, plano, valor, datas, SLA) ou `null`                                                                                                                                                                                                                                                    |
| `PATCH /clients/:id`          | + owner/admin/analyst                          | ao menos um campo                                                                                                                                                                                                                                                                                                             |
| `DELETE /clients/:id`         | + owner/admin/analyst                          | arquiva; responde o cliente com `status: archived`                                                                                                                                                                                                                                                                            |
| `GET/POST /plans`             | leitura: tenant · escrita: owner/admin/analyst | 409 `PLAN_NAME_TAKEN`                                                                                                                                                                                                                                                                                                         |
| `GET/PATCH /plans/:id`        | idem                                           |                                                                                                                                                                                                                                                                                                                               |
| `GET /contracts`              | auth + tenant                                  | `clientId`, `status`, paginação; padrão `sort=startDate&order=desc`                                                                                                                                                                                                                                                           |
| `POST /contracts`             | + owner/admin/analyst                          | `portfolioClientId`, `monthlyValue`, `startDate` obrigatórios; 404 `PLAN_NOT_FOUND` para plano de outra organização                                                                                                                                                                                                           |
| `GET/PATCH /contracts/:id`    | idem                                           | encerrar = `{ "status": "ended", "endDate": "AAAA-MM-DD" }`                                                                                                                                                                                                                                                                   |

Documentação viva em `/api/docs` (Swagger) e `/api/docs.json`. Schemas Zod compartilhados em
`packages/validation/src/clients/` (os mesmos nos formulários do web).

## 4. Telas (apps/web)

- `/clients` (`features/clients`): tabela (nome, código, segmento, porte, plano, valor mensal,
  status) com busca, filtros, ordenação pelo cabeçalho e paginação — tudo resolvido pela API;
  diálogo de cadastro/edição (React Hook Form + Zod); arquivar com confirmação; estados vazio,
  carregando e erro (§57). Viewer não vê os botões de escrita.
- `/settings` → aba **Planos** (`features/contracts/PlansManager`): lista, cria e edita planos.
- `features/contracts/ContractsPanel({ clientId })`: contratos do cliente (lista, novo, encerrar),
  exportado para a tela do cliente (Etapa 9) embutir.

## 5. Testes

- `apps/api/src/modules/portfolio-clients/__tests__/portfolio-clients.test.ts` e
  `apps/api/src/modules/contracts/__tests__/contracts.test.ts`: rotas com repositórios em memória
  (CRUD, filtros, paginação, arquivamento, RBAC, isolamento, contrato único ativo).
- `portfolio-clients.integration.test.ts`: contra o Supabase real; fica _skipped_ até as tabelas
  da Etapa 2 existirem no banco.
- `apps/web/src/features/clients/__tests__/` e `apps/web/src/features/contracts/__tests__/`:
  Testing Library com dublês da API.
