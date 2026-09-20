# Documentos e descoberta de métricas (Etapa 11)

A tela `/documents` é o **arquivo da organização**: um lugar só para tudo o que a empresa guarda
— contratos, manuais de KPI, políticas de SLA, relatórios **e as planilhas enviadas na importação
de dados** (§34). Do arquivo sai a **sugestão de métrica** para o modelo da organização. Regras na
[SPEC.md](SPEC.md) §35 (fluxo), §36 (`uploaded_documents`, `metric_extraction_suggestions`),
§37 (rotas Documents), §45 (allowlist de MIME e limite de upload) e os ajustes **A4** (DOCX e
JSON) e **A5** (IA fica para depois).

O que o arquivo guarda:

| Procedência (`origin`) | De onde vem                                                      | Quem envia             |
| ---------------------- | ---------------------------------------------------------------- | ---------------------- |
| `upload`               | arrastar/soltar ou botão na própria tela                         | owner/admin/analyst    |
| `import`               | bucket `imports`, onde a importação de dados guarda as planilhas | o módulo de importação |

Um arquivo `import` é só leitura para esta tela: ela lista, deixa baixar por URL assinada e
extrai o texto (uma planilha de importação vira prévia de abas e linhas), mas quem grava o
arquivo é a importação.

---

## 1. O fluxo em uma olhada (§35, modo manual)

```text
 navegador (apps/web)                 API (apps/api)                         Supabase
 ───────────────────                 ──────────────                         ────────
 /documents: arrasta o arquivo ──▶ POST /documents (multipart)
                                    allowlist MIME + extensão + assinatura
                                    ──────────────────────────────────────▶ Storage: bucket PRIVADO "documents"
                                                                            <org>/<doc>/<nome-seguro>
                                    ──────────────────────────────────────▶ uploaded_documents (status uploaded)
 /documents/:id ─────────────────▶ GET /documents/:id ◀──────────────────── URL assinada (5 min)
 "Extrair texto" ────────────────▶ POST /documents/:id/extract-metrics
                                    TextExtractor (por tipo) → texto
                                    ──────────────────────────────────────▶ Storage: <org>/<doc>/extracted.txt
                                    ──────────────────────────────────────▶ preview (20 kB), status extracted
                                    MetricExtractionProvider.extract()
                                      manual → nenhuma sugestão automática
 lê o texto, preenche o formulário ▶ POST /documents/:id/suggestions
                                    Zod + isSafeRule (fórmula)             ▶ metric_extraction_suggestions (pending)
 "Aceitar" ──────────────────────▶ POST /metric-suggestions/:id/accept
                                    status accepted + reviewed_by/at
                                    devolve metricPayload
 navega para /metrics com
 state.prefill = metricPayload ──▶ a métrica nasce em POST /metrics (Etapa 3), quando a pessoa confirma
```

**Ninguém ativa uma métrica sozinho** (§35): o aceite só marca a sugestão e entrega o payload; a
criação acontece na tela de métricas, com revisão humana. Rejeitar só marca `rejected`.

## 2. Tipos aceitos (§45 + A4)

| Extensão | MIME canônico gravado                                                     | Extrator                                       |
| -------- | ------------------------------------------------------------------------- | ---------------------------------------------- |
| `.pdf`   | `application/pdf`                                                         | `unpdf` — texto das páginas                    |
| `.docx`  | `application/vnd.openxmlformats-officedocument.wordprocessingml.document` | `mammoth` — texto corrido                      |
| `.xlsx`  | `application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`       | `xlsx` — por aba: cabeçalhos + 20 linhas       |
| `.csv`   | `text/csv`                                                                | `papaparse` — cabeçalhos, 20 linhas e o total  |
| `.json`  | `application/json`                                                        | nativo — chaves por nível e amostra dos arrays |
| `.md`    | `text/markdown`                                                           | direto                                         |
| `.txt`   | `text/plain`                                                              | direto                                         |

Regras de aceitação (`resolveUploadType` em `packages/validation/src/documents/`):

1. a **extensão** decide o tipo lógico e precisa estar na lista;
2. o **MIME declarado** pelo navegador precisa ser compatível: o canônico, um alias conhecido
   (`application/vnd.ms-excel` para CSV no Windows, `text/x-markdown`...), `text/plain` para os
   formatos de texto ou um genérico (`application/octet-stream`);
3. os **primeiros bytes** confirmam: PDF começa com `%PDF`, DOCX/XLSX são ZIP (`PK`), texto não
   pode ter byte nulo;
4. **limite de 10 MB** (`MAX_UPLOAD_BYTES`), aplicado no multer antes de ler o corpo inteiro, no
   bucket e na tela.

O mesmo módulo é usado pela tela (`accept` do input, mensagem imediata) e pela API, então o erro
que a pessoa vê no navegador é o mesmo que a API daria.

## 3. Rotas (§37)

| Rota                                         | Papéis                | Resposta                                                                                                             |
| -------------------------------------------- | --------------------- | -------------------------------------------------------------------------------------------------------------------- |
| `POST /api/v1/documents`                     | owner, admin, analyst | 201 `{ document }` · 413 `FILE_TOO_LARGE` · 415 `UNSUPPORTED_FILE_TYPE` · 400 `FILE_REQUIRED`                        |
| `GET /api/v1/documents`                      | membro                | `{ items, page, pageSize, total }` — `page`, `pageSize`, `search`, `sort`, `order`, `status`, `kind`, `origin` (§61) |
| `GET /api/v1/documents/:id`                  | membro                | `{ document }` com `downloadUrl` (assinada, 300 s) · 404                                                             |
| `POST /api/v1/documents/:id/extract-metrics` | owner, admin, analyst | `{ document, suggestions, extraction }` · 422 `TEXT_EXTRACTION_FAILED` (status `failed`)                             |
| `GET /api/v1/documents/:id/suggestions`      | membro                | `{ items, total }`                                                                                                   |
| `POST /api/v1/documents/:id/suggestions`     | owner, admin, analyst | 201 `{ suggestion }` · 400 `VALIDATION_ERROR` / `UNSAFE_FORMULA`                                                     |
| `POST /api/v1/metric-suggestions/:id/accept` | owner, admin, analyst | `{ suggestion, metricPayload }`                                                                                      |
| `POST /api/v1/metric-suggestions/:id/reject` | owner, admin, analyst | `{ suggestion }`                                                                                                     |

`viewer` só lê. Documentação viva em `/api/docs` (tag **documents**).

### O corpo da sugestão manual (`createMetricSuggestionSchema`)

```json
{
  "suggestedName": "Tempo médio de resolução",
  "description": "Horas até resolver chamados críticos",
  "suggestedType": "TIME",
  "suggestedDirection": "HIGHER_IS_WORSE",
  "unit": "h",
  "suggestedWeight": 0.16,
  "suggestedThresholds": {
    "strategy": "THRESHOLD_BANDS",
    "bands": [
      { "upTo": 8, "health": 100 },
      { "upTo": null, "health": 0 }
    ]
  },
  "suggestedFormula": { "if": [{ "<=": [{ "var": "value" }, 8] }, 100, 40] },
  "sourceExcerpt": "não pode passar de 8 horas"
}
```

`suggestedWeight` é fração 0–1 (§12); a tela pede em % e converte. `suggestedFormula` é JSON
Logic e passa por `isSafeRule` do engine ([METRICS_ENGINE.md](METRICS_ENGINE.md) §2): operador
fora da allowlist ou caminho como `constructor` responde `400 UNSAFE_FORMULA`.
`suggestedThresholds` aceita a estratégia e os campos dela (validação completa fica com a rota de
métricas, que conhece cada estratégia).

### O que o aceite devolve (`metricPayload`)

```json
{
  "name": "Tempo médio de resolução",
  "slug": "tempo-medio-de-resolucao",
  "description": "...",
  "category": "Descoberta em documento",
  "metricType": "TIME",
  "unit": "h",
  "direction": "HIGHER_IS_WORSE",
  "sourceType": "DOCUMENT",
  "periodicity": "MONTHLY",
  "weight": 0.16,
  "normalization": { "strategy": "THRESHOLD_BANDS", "bands": [] },
  "formula": {},
  "isActive": false,
  "origin": { "documentId": "…", "suggestionId": "…", "fileName": "manual-kpi.docx" }
}
```

É o rascunho para `POST /metrics` (§36 `metric_definitions` + peso/normalização). O web navega
para `/metrics` com `state: { prefill }`; a feature de métricas lê `location.state.prefill`
(`features/metrics/PrefillBanner.tsx`) e mostra a sugestão com os botões **Criar métrica** (faz o
`POST /metrics` com a definição, inativa, e abre `/metrics/:id`) e **Descartar**. Peso, normalização
e gatilhos entram no modelo pelo configurador (Etapa 10). `isActive: false` de propósito.

## 4. Banco (§36) — `apps/api/src/db/schema/documents.ts`

**`uploaded_documents`**: `id`, `organization_id` (FK, cascade), `storage_path`, `file_name`,
`mime_type`, `size_bytes`, `status` (`uploaded | extracted | failed`), **`origin`**
(`upload | import`, texto com CHECK e default `upload`), **`import_job_id`** (uuid, referência
lógica ao job da importação), `uploaded_by` (auth.users, lógico — **nulo** quando o arquivo veio
da importação), `extracted_text_path` (nullable), `extracted_text_preview` (até 20 kB),
`extraction_error`, `extracted_at`, `created_at`, `updated_at`.

Índice único **(`organization_id`, `storage_path`)**: é ele que torna a varredura do bucket da
importação idempotente — o mesmo arquivo nunca entra duas vezes no arquivo da organização.
`origin` é texto com CHECK (e não `pgEnum`) de propósito: o módulo de importação grava a linha
sem depender de um tipo novo no banco.

**`metric_extraction_suggestions`**: `id`, `uploaded_document_id` (FK, cascade), `organization_id`,
`suggested_name`, `description`, `suggested_type`, `suggested_direction` (texto com CHECK nos
enums da §6, para não disputar o nome do enum com a Etapa 3), `unit`, `suggested_weight` (0–1),
`suggested_formula_json`, `suggested_thresholds_json`, `confidence` (0–1; manual = 1), `source_excerpt`,
`provider` (`manual` ou o nome do provider de IA), `status` (`pending | accepted | rejected`),
`created_by`, `reviewed_by`, `reviewed_at`, `created_at`, `updated_at`.

RLS pelo Drizzle (`.enableRLS()` + `pgPolicy`), reaproveitando as funções SECURITY DEFINER da
migration `20260919205500_auth_organizations_rls.sql`: `select` para membros
(`current_user_organization_ids()`), `insert/update/delete` para `owner`, `admin` e `analyst`
(`current_user_role_in(organization_id)`). A API fala com o banco como `service_role` e filtra
por `organization_id` em toda query; o RLS é a segunda barreira. A migration é gerada pelo
integrador depois do merge.

## 5. Storage — `apps/api/src/infrastructure/storage/`

- `document-storage.ts`: interface `DocumentStorage` (`upload`, `download`, `createSignedUrl`,
  `remove`) e os caminhos: `<organizationId>/<documentId>/<nome-seguro>` para o original e
  `.../extracted.txt` para o texto. `sanitizeFileName` tira pastas, acentos e caracteres
  estranhos; o nome original fica no banco.
- `supabase-storage.ts`: implementação com o client **admin** (service_role, só no backend).
  Bucket privado `documents`, criado sob demanda com `public: false`, `fileSizeLimit` de 10 MB e a
  allowlist de MIME; se alguém tornar o bucket público a API se recusa a usá-lo. Erros do provedor
  viram `502 STORAGE_ERROR` sem detalhes internos.
- `memory-storage.ts`: mesma interface em memória, para testes e para rodar sem Supabase.
- `list(prefixo)`: devolve os objetos sob `<organization_id>/` (e uma subpasta abaixo). É o que
  permite ler o bucket `imports`, criado por outro módulo — por isso aquela instância nasce com
  `createBucketIfMissing: false`: este código nunca cria nem escreve no bucket alheio (§8).

Trocar de provedor = implementar `DocumentStorage` e passar `documentStorage` em
`createApiV1Router`.

## 6. Onde a IA entra depois (A5 — a fase manual é a de hoje) — `apps/api/src/infrastructure/extraction/`

```ts
interface MetricExtractionProvider {
  readonly name: string;
  extract(document: ExtractionDocument, text: ExtractedText): Promise<MetricSuggestionDraft[]>;
}
```

- `manual-provider.ts` — `ManualMetricExtractionProvider`: devolve `[]`. É o padrão.
- `anthropic-provider.ts` — **só o contrato**: `AiMetricExtractionProviderOptions` (chave, modelo,
  limite de texto, confiança mínima) e `createAiMetricExtractionProvider()`, que hoje lança
  `AiProviderNotConfiguredError`. Sem SDK, sem rede.

Quando a fase de IA chegar, basta implementar a interface e injetar `metricExtractionProvider`:
o service já valida cada rascunho com o mesmo Zod + `isSafeRule` da sugestão manual (rascunho
inválido é descartado, nunca derruba a extração), grava `provider` e `confidence`, e a revisão
humana continua obrigatória. Regras da §35: chave só no backend, saída estruturada, nada de logar
o conteúdo do documento.

## 7. Telas (apps/web/src/features/documents/)

| Rota             | O que faz                                                                                                                                                                                                                                                                  |
| ---------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/documents`     | **Arquivo da organização**: área de arrastar/soltar + botão (tipos e limite exibidos; validação local antes de enviar), avisos por arquivo e a lista unificada — filtro por **tipo**, filtro por **origem**, busca pelo nome, status e paginação.                          |
| `/documents/:id` | Metadados (arquivo, tipo, tamanho, origem, quem enviou, quando), download por URL assinada, botão **Extrair texto**, preview do texto, tabela de sugestões (Aceitar → `/metrics` com `state.prefill`; Rejeitar) e o formulário **Nova sugestão a partir deste documento**. |

Estados vazio/carregando/erro em todas as consultas (§57). O upload usa `fetch` direto com
`FormData` (o `apiFetch` é só para JSON) e o token do `AuthContext`.

## 8. A costura com a importação de dados (§34)

As planilhas da importação ficam no bucket **`imports`**, que pertence ao módulo de importação.
O arquivo da organização **só lê** esse bucket:

```text
apps/api/src/modules/documents/import-archive.ts     varre <organization_id>/ e monta as linhas
apps/api/src/infrastructure/storage/supabase-storage.ts   list() + createBucketIfMissing: false
```

Em `GET /documents`, antes de consultar o banco, o service varre o bucket (no máximo uma vez a
cada 30 s por organização, até 200 arquivos) e registra em `uploaded_documents` o que ainda não
estava lá, com `origin = 'import'` e `uploaded_by = null`. A varredura é **silenciosa**: bucket
inexistente, permissão negada ou provedor fora do ar não derrubam a listagem — o arquivo mostra
o que já tem. O caminho esperado é `<organization_id>/<import_job_id>/<arquivo>`; quando o
segundo segmento é um uuid, ele vira `import_job_id`.

Na resposta, cada item traz `origin` (`upload | import`) e `importJobId`, que é o que a tela usa
para agrupar e filtrar. O download de um arquivo `import` é assinado no bucket `imports`; o texto
extraído é sempre gravado no bucket `documents`, para não escrever no bucket do outro módulo.

### O vínculo na origem (ligado na integração)

Quem cataloga é a própria importação. Em `POST /imports`, assim que o job é criado, o service
chama a dependência `archive` e a linha entra em `uploaded_documents` já com `origin = 'import'`,
o `import_job_id` do job e o `uploaded_by` de quem enviou a planilha:

```text
apps/api/src/modules/imports/service.ts    dependência archive(ArchivedImportFile)
apps/api/src/routes/api-v1.ts              archive → documentsRepository.registerImportedDocuments
```

Assim o vínculo é **exato**, e não deduzido do caminho do objeto. Duas consequências de projeto:

- **Catalogar nunca derruba importar.** A chamada é `catch`-ada: se o banco falhar, a planilha
  continua guardada e o job continua válido. O que se perde é a linha do arquivo — que a varredura
  do bucket recupera na listagem seguinte.
- **A varredura continua existindo, como rede de segurança.** Ela cobre o que foi importado antes
  desta integração e qualquer objeto que tenha entrado no bucket por fora. Como a chave
  (`organization_id`, `storage_path`) é única e a gravação é `onConflictDoNothing`, as duas vias
  convivem sem duplicar nada.

`import_job_id` continua sem chave estrangeira, de propósito: a varredura deduz o job do caminho e
um id que não exista mais no `import_jobs` faria a listagem falhar em vez de mostrar o arquivo.

## 9. Segurança (§45)

- Bucket **privado**; o navegador nunca recebe a chave do storage, só uma **URL assinada de 5 min**
  emitida pela API depois de conferir o tenant.
- Allowlist de **extensão + MIME + assinatura de bytes** na API, no bucket e na tela; **10 MB**.
- Upload em memória com `multer` (um arquivo por requisição); o conteúdo nunca é executado nem
  interpretado além da extração de texto.
- Fórmulas só em JSON Logic com allowlist (`isSafeRule`), nunca `eval` (§45, §66).
- Escrita para `owner`/`admin`/`analyst`; `viewer` só lê. RLS como segunda barreira.
- Caminhos no bucket começam pelo `organization_id`; toda query filtra pelo tenant.

## 10. Testes

- `apps/api/src/modules/documents/__tests__/documents.test.ts` — rotas com dublês (token,
  organizações, repositório e storage em memória, extrator real): 401, RBAC, upload aceito/recusado
  (extensão, MIME, assinatura, 10 MB), lista/detalhe, filtros de tipo e origem, planilhas do bucket
  da importação (origem, job, idempotência, download assinado, bucket fora do ar), extração,
  sugestões (Zod, `UNSAFE_FORMULA`), aceite/rejeição, isolamento entre organizações, provider
  externo com rascunhos inválidos.
- `text-extractor.test.ts` — fixtures pequenas em `__tests__/fixtures/` (CSV, JSON, MD escritos à
  mão; DOCX, XLSX e PDF gerados por `fixtures/generate.ts`).
- `storage.test.ts` — storage em memória e o do Supabase com client dublê (bucket privado criado
  uma vez, URL assinada, remoção, erro → 502).
- `providers.test.ts` — manual devolve `[]`; provider de IA recusa ser construído.
- `documents.integration.test.ts` — contra o Supabase real; fica _skipped_ com aviso até as
  migrations desta etapa serem aplicadas.
- `apps/web/src/features/documents/__tests__/documents.test.tsx` — lista com origem, filtros de
  tipo/origem e busca, vazio, erro, recusa local de tipo e de tamanho, upload multipart, detalhe
  com metadados e prévia, extração, aceitar (navega para `/metrics` com `prefill`), rejeitar,
  formulário.
