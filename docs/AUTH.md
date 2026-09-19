# Autenticação e multiempresa (Etapa 1)

Como o login, a sessão, as organizações e os papéis funcionam — do navegador ao banco.
Regras na [SPEC.md](SPEC.md) §4 (modelo multiempresa), §5 (auth e segurança) e §37 (rotas).

---

## 1. O fluxo em uma olhada (§5)

```text
 navegador (apps/web)                    Supabase Auth                 API (apps/api)                banco
 ───────────────────                    ─────────────                 ──────────────                ─────
 1. /login: e-mail + senha ──────────▶ signInWithPassword
 2. recebe a sessão (JWT) ◀──────────  access_token + refresh_token
 3. GET /api/v1/me
    Authorization: Bearer <jwt> ─────────────────────────────────────▶ requireAuth
                                       auth.getUser(jwt) ◀──────────── valida o JWT (cache 60 s)
 4.                                                                    resolveTenant ─────────────▶ organization_users
                                                                       req.tenant = { organizationId, role, userId }
 5.                                                                    requireRole('owner','admin') nas rotas de escrita
 6.                                                                    toda query filtra por organization_id
```

- **Login, logout e recuperação de senha** acontecem direto entre o navegador e o Supabase Auth
  (chave `anon`). A API nunca vê a senha.
- **A API só recebe o JWT** e valida com `supabase.auth.getUser(token)` — funciona tanto com as
  chaves legadas (JWT `anon`/`service_role`) quanto com as novas (`sb_publishable_`/`sb_secret_`).
  Cada token validado fica 60 s num cache em memória (chaveado pelo hash do token).
- **Tenant**: o vínculo em `organization_users` diz a organização e o papel do usuário. Sem vínculo,
  `GET /me` responde `organization: null` e o front leva para `/onboarding`.
- **Isolamento cruzado**: o repositório recebe sempre o `organization_id` do tenant e filtra por ele.
  Um usuário da organização A nunca enxerga dados da B (teste de integração cobre isso).

## 2. Telas (apps/web)

| Rota               | O que faz                                                                                                              |
| ------------------ | ---------------------------------------------------------------------------------------------------------------------- |
| `/login`           | React Hook Form + Zod → `signInWithPassword`. Erro amigável ("E-mail ou senha incorretos."). Link "Esqueci a senha".   |
| `/forgot-password` | `resetPasswordForEmail(email, { redirectTo: <origem>/login })`. Mensagem neutra exista o e-mail ou não.                |
| `/login` (volta)   | O link do e-mail chega com o evento `PASSWORD_RECOVERY`; a tela vira "Definir nova senha" (`updateUser`).              |
| `/onboarding`      | Logado sem organização: cria a sua (nome + slug) via `POST /organizations` e vira **owner**. Vai para `/dashboard`.    |
| privadas           | `RequireAuth` (sem sessão → `/login` guardando a rota em `state.from`) → `RequireOrganization` (sem org → onboarding). |

O `AuthProvider` (`apps/web/src/features/auth/`) guarda `session`, `user`, `me` (resposta de
`GET /me`) e `signOut`, escutando `onAuthStateChange`. O `apiFetch` (`src/lib/api.ts`) anexa o
`access_token` da sessão em toda chamada e, num **401**, encerra a sessão e volta para `/login`.
O cabeçalho do layout privado mostra a organização, o e-mail do usuário e o botão **Sair**.

> **Redirect URLs no Supabase.** Para o link de recuperação funcionar, cadastre as URLs do front em
> _Authentication → URL Configuration → Redirect URLs_: `http://localhost:5173/**` e a URL da Vercel
> (`https://inovaapss-desafio.vercel.app/**`). Sem isso o Supabase redireciona para o Site URL.

## 3. Rotas da API (§37)

| Rota                                       | Guardas                         | Resposta                                                                                      |
| ------------------------------------------ | ------------------------------- | --------------------------------------------------------------------------------------------- |
| `GET /api/v1/me`                           | requireAuth, resolveTenant      | `{ user: { id, email }, organization \| null, role \| null }`                                 |
| `POST /api/v1/organizations`               | requireAuth, resolveTenant      | 201 `{ organization, role: 'owner' }`. 409 `SLUG_TAKEN` / `ALREADY_IN_ORGANIZATION`           |
| `GET /api/v1/organizations/current`        | + requireTenant                 | `{ organization, role }`. 403 `NO_ORGANIZATION` sem vínculo                                   |
| `PATCH /api/v1/organizations/current`      | + requireRole('owner', 'admin') | nome e/ou slug. 403 `FORBIDDEN` para analyst/viewer                                           |
| `GET /api/v1/organizations/current/users`  | + requireTenant                 | `{ items: [{ id, authUserId, email, role, createdAt }], total }`                              |
| `POST /api/v1/organizations/current/users` | + requireRole('owner', 'admin') | `{ email, role?, password? }` → 201 `{ member, outcome: 'invited' \| 'created' \| 'linked' }` |

Erros seguem o formato do error-handler: `{ error: { code, message, requestId, details? } }`.
Documentação viva em `/api/docs` (Swagger UI, fora de produção) e `/api/docs.json`.

## 4. Papéis (§4)

| Papel     | Pode                                                                               |
| --------- | ---------------------------------------------------------------------------------- |
| `owner`   | tudo, inclusive nomear outro `owner`                                               |
| `admin`   | editar a organização e convidar usuários (até o papel `admin`)                     |
| `analyst` | ler e operar (clientes, métricas, importações) — escrita chega nas próximas etapas |
| `viewer`  | somente leitura                                                                    |

`requireRole(...roles)` (`apps/api/src/middleware/rbac.ts`) é a guarda usada nas rotas. Nesta etapa
cada usuário pertence a **uma** organização (a primeira encontrada); troca de contexto fica para
quando houver necessidade.

## 5. Como criar o primeiro usuário

**Opção A — seed de demonstração (recomendada):** cria a organização `GlobalSys (demo)`
(`globalsys-demo`) e o usuário owner, já com e-mail confirmado. As credenciais vêm **só do ambiente**
(nunca de arquivo versionado):

```powershell
$env:SEED_DEMO_EMAIL = "demo@exemplo.com"
$env:SEED_DEMO_PASSWORD = "uma-senha-forte-12+"     # letras, números e símbolo
pnpm --filter @inovaapss/api seed:demo
```

Idempotente: rodar de novo só atualiza a senha e completa o que faltar.

**Opção B — painel do Supabase:** _Authentication → Users → Add user_ (marque "Auto Confirm User").
Depois faça login no front: sem organização, ele abre o `/onboarding` para você criar a sua.

## 6. Como convidar alguém

Com um `owner` ou `admin` logado, `POST /api/v1/organizations/current/users`:

- `{ "email": "ana@empresa.com", "role": "analyst" }` → **convite por e-mail**
  (`auth.admin.inviteUserByEmail`); a pessoa define a senha pelo link.
- `{ "email": "...", "role": "viewer", "password": "senha-temporaria" }` → **cria já confirmado**
  (`auth.admin.createUser`) com a senha temporária, que a pessoa troca em "Esqueci a senha".
- E-mail que já existe no Auth → só registra o vínculo (`outcome: 'linked'`).

A tela de Configurações (`/settings`) para fazer isso pela interface entra numa etapa seguinte.

## 7. O que o RLS cobre (§5)

Migration `supabase/migrations/*_auth_organizations_rls.sql`:

- `organizations` e `organization_users` têm **RLS ligado**.
- `select` liberado para membros da organização (`auth.uid()` em `organization_users`), via as funções
  `current_user_organization_ids()` e `current_user_role_in(uuid)` (SECURITY DEFINER, para não
  haver recursão de policy).
- `update` em `organizations` só para `owner`/`admin`.
- `insert`/`delete` não têm policy: só acontecem pela API.

A API conversa com o banco como `postgres`/`service_role`, que **ignora RLS** — o isolamento na API é
feito pelo middleware de tenant + filtro por `organization_id` em toda query. O RLS é a segunda
barreira, para quem acessar o banco direto pela API do Supabase com o JWT do usuário.

## 8. Variáveis

| Variável                                      | Onde             | Uso                                                             |
| --------------------------------------------- | ---------------- | --------------------------------------------------------------- |
| `SUPABASE_URL`, `SUPABASE_ANON_KEY`           | API              | validar o JWT (`auth.getUser`)                                  |
| `SUPABASE_SERVICE_ROLE_KEY`                   | API, **somente** | Admin API (convidar/criar usuário). Nunca no front.             |
| `DATABASE_URL`                                | API              | organizations / organization_users                              |
| `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` | web              | login, sessão, recuperação de senha                             |
| `VITE_API_URL`                                | web              | endereço da API                                                 |
| `SEED_DEMO_EMAIL`, `SEED_DEMO_PASSWORD`       | só no shell      | seed de demonstração (`pnpm --filter @inovaapss/api seed:demo`) |

Sem `SUPABASE_*` a API sobe e as rotas autenticadas respondem `503 SUPABASE_NOT_CONFIGURED`; sem
`VITE_SUPABASE_*` o front mostra "Autenticação não configurada" em vez de quebrar.

## 9. Testes

- `apps/api/src/middleware/__tests__/` — requireAuth (401, cache de 60 s), resolveTenant, requireTenant, requireRole.
- `apps/api/src/modules/organizations/__tests__/organizations.test.ts` — rotas com dublês (token e repositório em memória): onboarding, validação, RBAC, isolamento, convite.
- `apps/api/src/modules/organizations/__tests__/organizations.integration.test.ts` — contra o Supabase **real**; roda só com `DATABASE_URL` + `SUPABASE_*` no ambiente e as tabelas aplicadas (cria `test-*` e apaga no fim); senão fica _skipped_ com aviso.
- `apps/web/src/features/auth/__tests__/` e `apps/web/src/routes/RequireAuth.test.tsx` — formulário de login, redirecionamento sem sessão, onboarding, 401 → sair.
