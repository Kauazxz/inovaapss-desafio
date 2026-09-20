# Importação de dados — `@inovaapss/importer`

Como um arquivo XLSX, CSV ou JSON vira linhas validadas de clientes, atendimento mensal, NPS e
situação de clientes ([SPEC.md](SPEC.md) §34, §44, ajuste A4). Este documento cobre o **núcleo
puro** (`packages/importer`): leitura, detecção de colunas, mapeamento, coerção, validação e
relatório. Ele não conhece banco nem HTTP — a API da Etapa 7 (`apps/api/src/modules/imports/`)
chama estas funções, guarda `import_jobs` / `import_row_errors` e dispara o recálculo.

---

## 1. Fluxo (§34)

```text
Upload ──► leitura ──► detecção de colunas ──► mapeamento ──► validação ──► preview ──► confirmação ──► importação ──► recálculo
           readTabular   suggestMapping /       applyMapping    validateDataset   ImportReport     (API)          (API)          (API)
           readWorkbook  detectDataset          (coerção)       importDataset
           readCsv
           readJson
```

Tudo à esquerda de "preview" é este pacote e é determinístico: a mesma entrada produz sempre o
mesmo resultado, em qualquer máquina. A API só persiste e orquestra.

```ts
import { importDataset, readTabular, suggestMapping } from '@inovaapss/importer';

const { sheets } = readTabular(buffer, 'CSV'); // ou 'XLSX' | 'JSON'
const sheet = sheets[0];
const suggestion = suggestMapping(sheet.headers, 'monthly_metrics'); // a interface mostra e o usuário ajusta
const { rows, report } = importDataset(
  'monthly_metrics',
  sheet.rows,
  suggestion.mapping,
  sheet.headers,
);
// rows  → linhas tipadas, válidas e sem duplicidade (MonthlyMetricsRow[])
// report → { total, valid, invalid, duplicates, missingFields, errors[] }
```

## 2. Leitura

| Função                                      | Entrada                                           | Saída                                      | Observações                                                                                                                                                                      |
| ------------------------------------------- | ------------------------------------------------- | ------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `readWorkbook(input)`                       | `Buffer` · `Uint8Array` · `ArrayBuffer` · caminho | `{ sheets: TabularSheet[] }` (uma por aba) | SheetJS com `cellDates`: datas viram `Date`, números ficam número, texto fica texto.                                                                                             |
| `readCsv(input, { delimiter?, name? })`     | texto ou bytes UTF-8 (com ou sem BOM)             | `TabularSheet`                             | Delimitador detectado entre `;` `,` `\t` `\|` pela primeira linha (empate favorece `;`, o padrão do Excel em português). Tudo chega como texto; a coerção é feita no mapeamento. |
| `readJson(input)`                           | texto, bytes ou valor já interpretado             | `{ sheets }`                               | Aceita array de objetos; objeto de arrays de objetos (uma tabela por chave, como abas); objeto de colunas (`{ cliente_id: [...], valor: [...] }`).                               |
| `readTabular(input, 'XLSX'\|'CSV'\|'JSON')` | qualquer das anteriores                           | `{ sheets }`                               | Ponto único para a API, usando `IMPORT_FILE_TYPES` de `@inovaapss/shared`.                                                                                                       |
| `writeWorkbook([{ name, matrix }])`         | matrizes                                          | `Buffer` XLSX                              | Para testes e para a interface oferecer um modelo de planilha.                                                                                                                   |

`TabularSheet = { name, headers, normalizedHeaders, rows }`. Regras comuns: a primeira linha com
alguma célula preenchida é o cabeçalho; linhas totalmente vazias são descartadas; célula vazia vira
`null`; cabeçalho vazio vira `coluna_N` e repetido ganha `_2`, `_3`. Os cabeçalhos **originais**
(acentos, espaços, caixa) ficam em `headers` e são as chaves de cada linha; `normalizedHeaders`
tem a forma `normalizeHeader` (trim → minúsculas → sem acento → snake_case):
`"Valor Mensal (R$)"` → `valor_mensal_r`.

Erros de leitura (JSON inválido, CSV vazio, XLSX corrompido, aba ausente no preset) lançam
`ImportReadError` com mensagem em português. Erros de **dado** nunca lançam: entram no relatório.

## 3. Datasets e campos

O catálogo (`DATASETS`, `packages/importer/src/datasets/catalog.ts`) é dado, não código: a
interface de mapeamento lista os campos daqui, `suggestMapping` usa os sinônimos e a validação usa
`required` e `naturalKey`. Identificadores em inglês; rótulos em português.

### `clients` — chave natural `external_code`

| Campo                  | Tipo   | Obrig. | Sinônimos (normalizados)                                                                            |
| ---------------------- | ------ | ------ | --------------------------------------------------------------------------------------------------- |
| `external_code`        | text   | sim    | cliente_id, id_cliente, codigo_cliente, cod_cliente, codigo, cliente, client_id, customer_id, id... |
| `name`                 | text   | não    | nome, nome_cliente, razao_social, nome_fantasia, empresa, name, client_name, company                |
| `segment`              | text   | sim    | segmento, setor, segment, sector, industry, industria, vertical                                     |
| `size`                 | text   | sim    | porte, tamanho, size, company_size, porte_empresa                                                   |
| `plan`                 | text   | sim    | plano, plan, plano_contratado, tier, pacote                                                         |
| `monthly_value`        | number | sim    | valor_mensal, valor_mensal_r, mensalidade, mrr, receita_mensal, valor, monthly_value, monthly_fee   |
| `contracted_sla_hours` | number | sim    | sla_contratado_h, sla_contratado, sla_h, sla_horas, sla, contracted_sla_hours, prazo_resolucao_h    |
| `contract_start`       | date   | sim    | inicio_contrato, data_inicio, inicio, contract_start, start_date, data_contrato, cliente_desde      |

### `monthly_metrics` — chave natural `external_code` + `period`

| Campo                  | Tipo    | Obrig. | Sinônimos (normalizados)                                                                    |
| ---------------------- | ------- | ------ | ------------------------------------------------------------------------------------------- |
| `external_code`        | text    | sim    | (como acima)                                                                                |
| `period`               | period  | sim    | mes_ref, mes, mes_referencia, periodo, competencia, period, month, ano_mes, data_ref        |
| `open_tickets`         | integer | não    | chamados_abertos, chamados, tickets, tickets_abertos, open_tickets, qtd_chamados            |
| `critical_tickets`     | integer | não    | chamados_criticos, criticos, critical_tickets, chamados_urgentes, incidentes_criticos       |
| `reopened_tickets`     | integer | não    | chamados_reabertos, reabertos, reopened_tickets, reaberturas                                |
| `tickets_within_sla`   | integer | não    | chamados_dentro_sla, dentro_sla, tickets_within_sla, chamados_no_prazo, within_sla          |
| `sla_compliance_pct`   | number  | não    | pct_sla_cumprido, sla_cumprido, pct_sla, sla_pct, sla_compliance_pct, cumprimento_sla       |
| `avg_resolution_hours` | number  | não    | tempo_medio_resolucao_h, tempo_medio_resolucao, tmr, mttr, avg_resolution_hours             |
| `formal_complaints`    | integer | não    | reclamacoes_formais, reclamacoes, formal_complaints, complaints, queixas                    |
| `platform_usage_pct`   | number  | não    | uso_plataforma_pct, uso_plataforma, uso, utilizacao, usage, platform_usage_pct, adoption    |
| `payment_delay_days`   | integer | não    | dias_atraso_pagamento, atraso_pagamento, dias_atraso, atraso, payment_delay_days, days_late |
| `meetings_planned`     | integer | não    | reunioes_previstas, reunioes_agendadas, meetings_planned, planned_meetings                  |
| `meetings_completed`   | integer | não    | reunioes_realizadas, reunioes_feitas, meetings_completed, meetings_held                     |

Métricas opcionais em branco viram `null` e chegam ao motor como N/A ("ausência não é saúde",
§66): entram na confiança, não no score. `pct_sla_cumprido` vazio quando não houve chamado é o
caso típico (23 linhas na planilha do desafio).

### `nps` — chave natural `external_code` + `period`

| Campo            | Tipo    | Obrig. | Sinônimos (normalizados)                                                   |
| ---------------- | ------- | ------ | -------------------------------------------------------------------------- |
| `external_code`  | text    | sim    | (como acima)                                                               |
| `period`         | period  | sim    | (como acima)                                                               |
| `answered`       | boolean | sim    | respondeu, respondido, answered, responded, has_answer                     |
| `score`          | integer | não\*  | nota_nps, nota, nps, nps_score, score, nota_pesquisa, pontuacao            |
| `classification` | enum    | não    | classificacao_nps, classificacao, categoria_nps, nps_class, classification |

\* obrigatória quando `answered = true`. Saída: `classification` ∈ `promoter | neutral |
detractor | no_answer` (Promotor/Neutro/Detrator/Sem resposta), derivada da nota (9–10, 7–8, 0–6)
quando a coluna não existe.

### `client_status` — chave natural `external_code`

| Campo                 | Tipo   | Obrig. | Sinônimos (normalizados)                                                                       |
| --------------------- | ------ | ------ | ---------------------------------------------------------------------------------------------- |
| `external_code`       | text   | sim    | (como acima)                                                                                   |
| `status`              | enum   | sim    | situacao, situacao_cliente, status, client_status, estado, ativo                               |
| `cancellation_period` | period | não\*  | mes_cancelamento, cancelamento, data_cancelamento, mes_churn, cancellation_period, churn_month |

\* obrigatório quando `status = cancelled`. Valores aceitos: Ativo/Ativa/active → `active`;
Cancelado/Cancelada/cancelled/canceled/churn/inativo/inactive → `cancelled`.

## 4. Detecção e mapeamento

`suggestMapping(headers, dataset, { minConfidence = 0,5 })` devolve, por campo, o cabeçalho
escolhido e a confiança:

| Confiança | Como                                   | Exemplo                                              |
| --------- | -------------------------------------- | ---------------------------------------------------- |
| 1,00      | cabeçalho normalizado = chave do campo | `external_code`                                      |
| 0,95      | sinônimo exato                         | `cliente_id`, `Valor Mensal (R$)` → `valor_mensal_r` |
| ≤ 0,85    | um contém o outro, por palavra inteira | `valor_mensal_do_contrato` ⊃ `valor_mensal`          |
| ≤ 0,80    | tokens em comum (Jaccard ≥ 0,34)       | `mensal_valor_bruto` ~ `valor_mensal`                |

Cada cabeçalho é usado por no máximo um campo (atribuição gulosa pela maior confiança; empates
resolvidos pela ordem do catálogo e do arquivo, portanto determinístico). `HIGH_CONFIDENCE = 0,9`
é o limiar para a interface aceitar sem revisão; `missingRequired` lista os obrigatórios sem coluna
e `unmappedHeaders` os cabeçalhos sobrando. `detectDataset(headers)` ordena os quatro datasets
pela confiança — é o "que tabela é esta?" quando o usuário sobe um arquivo sem dizer.

`applyMapping(rows, mapping, dataset)` produz uma linha por linha de entrada com **todos** os
campos do dataset (sem coluna = `null`) e coage cada valor:

| Tipo      | Aceita                                                                                                                          | Vira           |
| --------- | ------------------------------------------------------------------------------------------------------------------------------- | -------------- |
| `text`    | qualquer escalar (apara espaços)                                                                                                | `string`       |
| `number`  | número; `"1.234,56"`, `"1,234.56"`, `"64,3%"`, `"R$ 9.800"` — quando há `,` e `.`, o último é o decimal; só `,` é decimal       | `number`       |
| `integer` | como number, sem parte decimal                                                                                                  | `number`       |
| `period`  | `2025-03`, `2025-3`, `2025/03`, `2025-03-15`, `03/2025`, `15/03/2025`, `202503`, `mar/2025`, `março 2025`, `Date`, serial Excel | `"AAAA-MM"`    |
| `date`    | `2020-09-01`, `01/09/2020` (dia/mês/ano), `2020-09` (dia 1), `Date`, serial Excel                                               | `"AAAA-MM-DD"` |
| `boolean` | `0/1`, `true/false`, `sim/não`, `s/n`, `yes/no`, `verdadeiro/falso`                                                             | `boolean`      |
| `enum`    | valor normalizado presente em `enumValues` do campo                                                                             | valor canônico |

Datas de planilha são meia-noite local (SheetJS) e datas de JSON são meia-noite UTC; `dateToYmd`
reconhece os dois e dá o mesmo dia de calendário. Coerção que falha gera erro `INVALID_*` no
campo e deixa `null` na linha, para a validação apontar tudo de uma vez.

## 5. Validação e relatório

`validateDataset(dataset, applied)` (ou o atalho `importDataset`) roda o schema Zod do dataset
(`packages/importer/src/datasets/schemas.ts`) em cada linha e devolve:

```ts
interface ImportReport {
  total: number; // linhas de dados lidas = valid + invalid + duplicates
  valid: number; // saem tipadas em `rows`
  invalid: number; // qualquer erro de coerção ou de schema
  duplicates: number; // chave natural repetida entre as válidas (a primeira fica)
  missingFields: string[]; // obrigatórios sem coluna mapeada
  errors: { row; field; code; message }[]; // row = posição entre as linhas de dados (1 = primeira após o cabeçalho)
}
```

Códigos (`IMPORT_ERROR_CODES`): `MISSING_REQUIRED`, `INVALID_TEXT`, `INVALID_NUMBER`,
`INVALID_INTEGER`, `INVALID_PERIOD`, `INVALID_DATE`, `INVALID_BOOLEAN`, `INVALID_ENUM`,
`OUT_OF_RANGE`, `INCONSISTENT`, `DUPLICATE`, `INVALID_VALUE`. Mensagens em português, já com o
rótulo do campo ("Valor mensal é obrigatório.", "Mês do cancelamento: \"ontem\" não é um período
reconhecido (AAAA-MM)."). Um campo cuja coerção falhou não recebe um segundo erro do schema.

Regras além de tipo e presença:

- `clients`: `monthly_value ≥ 0`, `contracted_sla_hours > 0`.
- `monthly_metrics`: inteiros ≥ 0; percentuais 0–100; `critical_tickets`, `reopened_tickets` e
  `tickets_within_sla` ≤ `open_tickets`; `meetings_completed ≤ meetings_planned` (`INCONSISTENT`).
- `nps` (§22): `respondeu = 0` com nota vazia é **válida** → `answered: false`, `score: null`,
  `classification: 'no_answer'` — nunca erro. `answered = true` sem nota → `MISSING_REQUIRED`;
  nota fora de 0–10 → `OUT_OF_RANGE`. Quando não respondeu, uma nota eventualmente presente é
  descartada (não é resposta).
- `client_status`: `cancelled` sem `cancellation_period` → `MISSING_REQUIRED` (a calibração da
  Etapa 12 precisa do mês).

`mergeReports([...])` soma relatórios de várias tabelas para o resumo do job; `emptyReport()`
inicia um.

## 6. Preset da planilha do desafio (§44)

`importGlobalSysWorkbook(buffer | caminho)` lê `data/INOVAAPPS_base_de_dados.xlsx` inteira com
mapeamento **fixo** (`GLOBALSYS_SHEET_PRESETS`), ignorando `Leia-me` e `dicionario`:

| Aba                  | Dataset           | Conversões                                                                                                                                                                            |
| -------------------- | ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `clientes`           | `clients`         | `sla_contratado_h` (horas) → `contracted_sla_hours` (horas; a API converte para minutos ao montar a política de SLA do engine); sem coluna de nome (`name: null`, a API usa o código) |
| `atendimento_mensal` | `monthly_metrics` | `mes_ref` → `period`; `pct_sla_cumprido` vazio → `null`                                                                                                                               |
| `pesquisas_nps`      | `nps`             | `respondeu` 0/1 → boolean; nota vazia com `respondeu = 0` → válida                                                                                                                    |
| `situacao_clientes`  | `client_status`   | `situacao` Ativo/Cancelado → `active`/`cancelled`; `mes_cancelamento` → `cancellation_period`                                                                                         |

Resultado: `{ clients, monthlyMetrics, nps, clientStatus, report }`, com `report` por dataset mais
`summary` e `hasErrors`. Aba ausente lança `ImportReadError`; cabeçalho renomeado aparece em
`missingFields` sem exceção. O teste `globalsys-xlsx.test.ts` confere os totais conhecidos da
planilha (80 clientes somando R$ 982.964, 1.295 linhas mensais em 18 períodos de 2025-01 a
2026-06, 422 pesquisas com 338 respondidas, 22 cancelados, relatório sem erros) e é pulado com
aviso se o arquivo não estiver no checkout.

## 7. Como a Etapa 7 (API e web) usa o pacote

| Passo do fluxo | Rota (§37)                  | O que faz com o pacote                                                                                                                                                                                                                                                                                                    |
| -------------- | --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Upload         | `POST /imports`             | Valida MIME (`ALLOWED_UPLOAD_MIME_TYPES`) e tamanho, guarda o arquivo no Storage, cria `import_jobs` (`status = uploaded`, `file_type`), chama `readTabular` e responde com as tabelas encontradas (`name`, `headers`, amostra de linhas) e `detectDataset` para cada uma.                                                |
| Mapeamento     | `GET /imports/:id`          | Devolve `suggestMapping(headers, dataset)`; a interface (`apps/web/src/features/import/`) mostra campo × coluna com a confiança e deixa o usuário trocar. O mapeamento final vai em `mapping_json`.                                                                                                                       |
| Preview        | `POST /imports/:id/preview` | `importDataset(dataset, rows, mapping, headers)`; responde `report` + primeiras linhas válidas. Nada é gravado além de `summary_json`.                                                                                                                                                                                    |
| Confirmação    | `POST /imports/:id/confirm` | Repete a validação (nunca confia no preview), grava `import_row_errors` a partir de `report.errors` (`row_number`, `error_code`, `message`, `raw_data_json`), faz upsert pela chave natural em `portfolio_clients` / `metric_values` / `contracts` conforme o dataset, marca `status = done` e dispara o recálculo (§62). |
| Erros          | `GET /imports/:id`          | `summary_json` = `ImportReport` sem `errors` + contagem; a lista paginada vem de `import_row_errors` (§61).                                                                                                                                                                                                               |

Mapeamento para as tabelas (§36): `clients` → `portfolio_clients` (`external_code`, `name` ou
código, `segment`, `size`) + `contracts`/`plans` (`plan`, `monthly_value`,
`contracted_sla_hours × 60` em `sla_policies.resolution_minutes`, `contract_start`);
`monthly_metrics` → uma linha em `metric_values` por campo não nulo, com `period = "AAAA-MM"`,
`source = CSV | XLSX | JSON` e o `metric_definition_id` do preset (chave do campo = `key` da
métrica); `nps` → `metric_values` da métrica `nps` com `value = score` e `extra = { answered,
classification }`; `client_status` → `portfolio_clients.status` e `cancelled_at` (base da
calibração, §33). Tudo é `upsert` pela chave natural para reimportações serem idempotentes.

Segurança (§45): o pacote não executa nada do arquivo (sem fórmulas, sem `eval`); o SheetJS é usado
só para ler células. Limite de linhas por arquivo e tempo de processamento ficam na API.

## 8. Testes

`pnpm --filter @inovaapss/importer test` — Vitest com cobertura v8 (limiares 90 % linhas /
funções / statements, 85 % branches). Fixtures pequenas geradas no próprio teste (CSV, JSON, XLSX
via `writeWorkbook`) mais a planilha real do desafio quando presente.
