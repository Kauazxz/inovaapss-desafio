# Supabase — banco de dados e deploy

O Supabase e o nosso back-end: banco Postgres + API automatica + autenticacao,
tudo hospedado por eles. O front-end conversa com ele pela internet.

---

## Como o deploy funciona: sozinho, a cada push

**Ninguem roda deploy na mao.** Quando qualquer pessoa envia um commit que mexe na pasta
`supabase/` — de qualquer maquina, com ou sem Live Share — o **GitHub Actions** aplica
as mudancas no projeto do Supabase automaticamente.

```
alguem programa  (aqui ou la, tanto faz)
        |
Ctrl+Shift+B  (commita e envia)
        |
GitHub Actions roda .github/workflows/deploy-supabase.yml
        |
migrations aplicadas no banco  ->  aba Actions fica verde  ->  painel do Supabase atualizado
```

Se duas pessoas enviarem ao mesmo tempo, os deploys entram numa fila e rodam um depois
do outro — nunca ao mesmo tempo.

---

## Configurar uma vez (so uma pessoa faz)

### 1. Criar o projeto no Supabase
1. https://supabase.com → **Start your project** → entrar com o GitHub
2. **New project** → nome `inovaapss`, regiao **South America (Sao Paulo)**
3. **Guarde a senha do banco** (Database Password) — vai precisar dela no passo 2

### 2. Guardar 3 segredos no GitHub
O GitHub Actions precisa de 3 informacoes para entrar no projeto. Elas ficam guardadas
**criptografadas no repositorio**, nunca no codigo.

| Segredo | Onde pegar |
|---|---|
| `SUPABASE_ACCESS_TOKEN` | https://supabase.com/dashboard/account/tokens → **Generate new token** (nome: `github-actions`) |
| `SUPABASE_PROJECT_ID` | O codigo na URL do painel: `supabase.com/dashboard/project/`**`abcdefghijklmnop`** |
| `SUPABASE_DB_PASSWORD` | A senha do banco escolhida no passo 1 |

No terminal, dentro da pasta do projeto. Cada comando pede o valor e **esconde o que voce digita**:

```powershell
gh secret set SUPABASE_ACCESS_TOKEN
gh secret set SUPABASE_PROJECT_ID
gh secret set SUPABASE_DB_PASSWORD
```

Ou pelo site: repositorio → **Settings → Secrets and variables → Actions → New repository secret**.

> Nunca cole esses valores em chat, commit ou arquivo do projeto. Se vazar, gere outro no painel.

### 3. Testar
No GitHub: aba **Actions** → **Deploy no Supabase** → **Run workflow** → **Run workflow**.
Em ~1 minuto tem que ficar **verde**. Se ficar vermelho, clique nele: a mensagem diz o que falta.

### 4. Chaves para o front-end
Copie `.env.example` para `.env` e preencha com o que esta em
**Project Settings → API** no painel: a URL e a chave **anon / public**.

> O `.env` nao vai para o GitHub. Nunca cole chaves direto no codigo.
> A chave **service_role** nunca vai para o front-end — ela ignora todas as regras de seguranca.

---

## Dia a dia: mudar o banco

Toda mudanca no banco (criar tabela, adicionar coluna...) e um **arquivo de migration**:
um `.sql` com data no nome, dentro de `supabase/migrations/`.
Como e arquivo, vai pelo Git — e o push faz o deploy.

### 1. Criar a migration
```powershell
npx supabase migration new criar_tabela_usuarios
```
Gera `supabase/migrations/20260919120000_criar_tabela_usuarios.sql`. Escreva o SQL nele:

```sql
create table usuarios (
  id         uuid primary key default gen_random_uuid(),
  nome       text not null,
  email      text unique not null,
  criado_em  timestamptz default now()
);
```

### 2. Enviar
`Ctrl+Shift+B`. So isso. O GitHub Actions aplica no banco em ~1 minuto.

O deploy aplica **so as migrations que ainda nao foram aplicadas**, na ordem.

> **Cuidado:** o deploy nao apaga nada sozinho — mas uma migration com `drop table` apaga.
> Leia o SQL antes de enviar. Nao da para "desfazer" um deploy.

---

## Ver funcionando

| Onde | O que voce ve |
|---|---|
| **GitHub → aba Actions** | Verde = deploy feito. Vermelho = clique para ver o erro |
| **Supabase → Table Editor** | As tabelas e os dados, como uma planilha |
| **Supabase → SQL Editor** | Roda qualquer consulta na hora |
| **Supabase → Logs** | Erros e chamadas da API em tempo real |
| **Supabase → API Docs** | A API gerada automaticamente para cada tabela |

---

## Edge Functions (opcional)

Codigo que roda no servidor do Supabase (TypeScript/Deno). Util para logica que
nao pode ficar no front-end, como falar com APIs externas usando chaves secretas.

```powershell
npx supabase functions new minha-funcao      # cria supabase/functions/minha-funcao/index.ts
```
Depois e `Ctrl+Shift+B` — o GitHub Actions envia as functions junto com as migrations.

---

## Deploy manual (so se precisar)

Se o GitHub Actions estiver fora do ar, da para deployar da sua maquina. Uma vez:
```powershell
npx supabase login
npx supabase link --project-ref abcdefghijklmnop
```
Depois: `npm run deploy` (ou a task **Deploy manual no Supabase**). Normalmente **nao precisa**.

## Rodar o Supabase localmente (opcional, nao precisa)

`npx supabase start` sobe um Supabase completo na sua maquina, mas exige **Docker Desktop**.
Para este projeto **nao precisa**: deployamos direto no projeto hospedado.

---

## Problemas comuns

| Onde | Mensagem | Solucao |
|---|---|---|
| Actions | `Faltam segredos no repositorio` | Fazer o passo 2 de "Configurar uma vez" |
| Actions | `password authentication failed` | Senha errada: `gh secret set SUPABASE_DB_PASSWORD` de novo |
| Actions | `Invalid access token` | Token expirado ou errado: gere outro e `gh secret set SUPABASE_ACCESS_TOKEN` |
| Actions | erro de SQL (`syntax error`, `already exists`) | Corrija o `.sql` da migration e envie de novo |
| Terminal | `Access token not provided` | So para deploy manual: `npx supabase login` |
| Terminal | `Cannot find project ref` | So para deploy manual: `npx supabase link --project-ref ...` |
