# Importação de dados — `@inovaapss/importer`

Como um arquivo XLSX, CSV ou JSON vira linhas validadas de clientes, atendimento mensal, NPS e
situação de clientes ([SPEC.md](SPEC.md) §34, §44, ajuste A4), e daí em clientes, contratos e
valores de métrica no banco.

As seções 1 a 6 cobrem o **núcleo puro** (`packages/importer`): leitura, detecção de colunas,
mapeamento, coerção, validação e relatório. Ele não conhece banco nem HTTP. As seções 7 a 10
cobrem a **API** (`apps/api/src/modules/imports/`), que guarda `import_jobs` /
`import_row_errors`, grava os dados e dispara o recálculo, e a **tela** `/import`
(`apps/web/src/features/import/`), por onde a pessoa passa.

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

## 7. A API: rotas e o que cada uma faz

Tudo abaixo de `/api/v1/imports`. Ler é para qualquer membro; enviar, conferir e importar exigem
**owner, admin ou analyst** (viewer só acompanha o histórico).

| Passo do fluxo | Rota                        | O que faz                                                                                                                                                                                                                                                                                                                    |
| -------------- | --------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Upload         | `POST /imports`             | multipart, campo `file`. Confere extensão + MIME + os primeiros bytes (§45) e o limite de **20 MB**, lê o arquivo com `readTabular`, guarda no bucket privado `imports` do Supabase Storage e cria o `import_jobs` (`status = uploaded`). Responde com as tabelas, os cabeçalhos, uma amostra e `detectDataset` de cada uma. |
| Histórico      | `GET /imports`              | Importações anteriores, da mais recente para a mais antiga, paginadas (§61).                                                                                                                                                                                                                                                 |
| Detalhe        | `GET /imports/:id`          | O job, as tabelas relidas do arquivo e os erros por linha guardados em `import_row_errors`.                                                                                                                                                                                                                                  |
| Preview        | `POST /imports/:id/preview` | Escolhe o mapeamento de cada tabela, roda `importDataset` e responde válidas, inválidas, duplicadas, campos ausentes e os erros por linha. Grava só `mapping_json` e `summary_json` (`status = previewed`).                                                                                                                  |
| Confirmação    | `POST /imports/:id/confirm` | **Relê o arquivo do storage e revalida**: o preview é informação, não autorização. Grava os dados, registra os erros recusados e dispara o recálculo (`status = confirmed`).                                                                                                                                                 |

### A planilha também entra no arquivo da organização (§35)

No mesmo `POST /imports`, logo depois de criar o job, o service chama a dependência `archive` e a
planilha é registrada em `uploaded_documents` com `origin = 'import'`, o `import_job_id` do job e
o `uploaded_by` de quem enviou. É assim que a tela `/documents` mostra as planilhas importadas
junto com os documentos enviados por lá, com o vínculo exato em vez de deduzido do caminho.

A chamada é isolada por `catch`: **catalogar nunca derruba importar**. Se ela falhar, a planilha
continua guardada e o job continua válido — a varredura do bucket feita por `/documents` registra
o arquivo na listagem seguinte. Detalhes em [DOCUMENTS.md](DOCUMENTS.md) §8.

O corpo de `preview` e de `confirm` é o mesmo:

```jsonc
{
  "sheets": [
    { "sheet": "clientes", "dataset": "clients", "mapping": { "external_code": "cliente_id" } },
  ],
  "recalculate": true, // só em confirm; false grava sem refazer os scores
}
```

Sem `sheets`, a API decide sozinha, nesta ordem:

1. **Preset da planilha do desafio** — o nome da aba casa com `GLOBALSYS_SHEET_PRESETS` (§6) e
   todos os cabeçalhos do preset existem: usa o mapeamento fixo (`mappingSource: "preset"`).
2. **Detecção pelos cabeçalhos** — `detectDataset` com confiança ≥ 0,5 (`"suggested"`).
3. **Ignora** — a tabela entra em `skipped` com o motivo. É o que acontece com as abas `Leia-me`
   e `dicionario`: são texto, não dado.

Na confirmação sem `sheets`, vale o mapeamento que o preview guardou em `mapping_json`.

### O que a confirmação grava (§36)

| Dataset           | Onde vai                                                                                                                                                                                                        |
| ----------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `clients`         | `plans` (os que faltarem nascem), `portfolio_clients` (`external_code`, `name` ou o código, `segment`, `size`) e um `contracts` por cliente (`plan_id`, `monthly_value`, `contracted_sla_hours`, `start_date`). |
| `client_status`   | `portfolio_clients.status`; cancelado encerra o contrato no **último dia do mês** da saída (`end_date`), que é o que a calibração usa (§33). Código sem cliente cadastrado vira aviso, não erro.                |
| `monthly_metrics` | Uma linha em `metric_values` por métrica, resolvendo o cliente por `external_code` e a métrica por `slug`. Além dos campos diretos, grava as duas taxas derivadas (reabertura e reuniões perdidas).             |
| `nps`             | `metric_values` da métrica `nps_dissatisfaction`, com `answered` numa coluna própria.                                                                                                                           |

Campo → slug da métrica: `open_tickets`, `critical_tickets`, `avg_resolution_hours` →
`resolution_vs_sla`, `platform_usage_pct` → `platform_usage`, `sla_compliance_pct` →
`sla_compliance`, `formal_complaints`, `payment_delay_days` → `payment_delay`, mais
`reopened_tickets` (reabertos ÷ abertos) e `missed_meetings` ((previstas − realizadas) ÷
previstas). Métrica que a organização não tem cadastrada é ignorada e aparece em `skipped`.

### As duas regras que não podem se perder

Valem aqui e no seed da planilha, e estão travadas por teste em
`apps/api/src/modules/imports/__tests__/ingest.test.ts`:

- **Reuniões previstas = 0 → valor NULO** (§15 de [DEFINICOES_METRICAS.md](DEFINICOES_METRICAS.md)),
  nunca 0 %. Zero por cento diria "não perdeu nenhuma reunião"; a verdade é que não havia reunião
  marcada. Vale para qualquer taxa com divisor zero.
- **NPS não respondido → valor NULO com `answered = 'false'`** (§16), nunca nota zero. Zero é a
  pior avaliação possível; silêncio não é avaliação. Se a planilha trouxer nota com
  `respondeu = 0`, a nota é descartada.

## 8. A tela `/import`

Quatro passos, com volta em qualquer um deles:

1. **Arquivo** — arrastar ou escolher. A allowlist e o limite de 20 MB são conferidos no
   navegador antes de subir, com a mesma função da API (`resolveImportFileType`).
2. **Colunas** — as tabelas do arquivo com o conjunto de dados que a API detectou; dá para trocar
   ou marcar "não importar".
3. **Conferência** — as quatro contagens da §34, os campos obrigatórios sem coluna, as tabelas
   ignoradas, os erros por linha e a tabela **coluna → campo** com a confiança de cada escolha e
   o porquê ("sinônimo conhecido", "planilha do desafio"…). Corrigir uma coluna e revalidar não
   custa nova importação. Obrigatório sem coluna **bloqueia** o botão de importar.
4. **Resultado** — o que foi gravado, o que ficou de fora e links para o dashboard e para a lista
   de clientes.

Abaixo, sempre visível, o **histórico**: data, arquivo, tamanho, contagens e situação de cada
importação anterior.

O atalho **Importar dados** fica no topo do dashboard e no estado vazio dele — é onde a pergunta
"como coloco meus dados aqui?" costuma aparecer.

## 9. Reimportar sem duplicar

Reimportar o mesmo arquivo (ou uma versão corrigida dele) **atualiza**; não duplica. Tudo é
resolvido pela chave natural:

| O quê          | Chave                                 | Reimportar faz                                   |
| -------------- | ------------------------------------- | ------------------------------------------------ |
| Plano          | nome, dentro da organização           | reaproveita o existente                          |
| Cliente        | `external_code`                       | atualiza nome, segmento, porte e situação        |
| Contrato       | um por cliente                        | atualiza plano, valor, SLA e datas               |
| Valor mensal   | cliente + métrica + início do período | corrige o valor no lugar                         |
| Erros da linha | o próprio job                         | os erros antigos do job são trocados pelos novos |

**Nada é apagado.** Um período que não veio no arquivo continua no banco: importar a planilha de
um mês não pode fazer os outros meses sumirem. Por isso, para corrigir um mês, basta reenviar
aquele mês.

Fluxo recomendado quando o preview acusa erros: corrija a planilha, envie o arquivo corrigido e
confirme. As linhas boas que já tinham entrado serão atualizadas com o mesmo conteúdo, e as que
faltavam entram. Para importar vários arquivos em sequência, mande `recalculate: false` em todos
menos no último — o recálculo da carteira inteira roda uma vez só.

## 10. Testes

- `pnpm --filter @inovaapss/importer test` — o núcleo puro. Vitest com cobertura v8 (limiares
  90 % linhas / funções / statements, 85 % branches). Fixtures pequenas geradas no próprio teste
  (CSV, JSON, XLSX via `writeWorkbook`) mais a planilha real do desafio quando presente.
- `pnpm --filter @inovaapss/api test` — as rotas com repositórios em memória e uma planilha em
  miniatura montada no teste, com os mesmos nomes de aba e coluna do desafio (é assim que o
  preset é exercitado); as regras de N/A de reuniões e NPS; a recusa de MIME e de tamanho; o
  isolamento entre organizações; e a integração com o Supabase real, que fica **skipped** com
  aviso quando faltam as variáveis de ambiente ou a tabela `import_jobs`.
- `pnpm --filter @inovaapss/web test` — a tela: caminho completo, arquivo recusado no navegador
  sem chamar a API, campo obrigatório sem coluna bloqueando a importação e o histórico.

Segurança (§45): nada do arquivo é executado (sem fórmulas, sem `eval`); o SheetJS só lê células.
O teto de linhas por tabela (`IMPORT_MAX_ROWS_PER_SHEET`) e o limite de 20 MB ficam na API.
