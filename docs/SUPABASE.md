# Supabase — banco de dados e deploy

O Supabase e o nosso back-end: banco Postgres + API automatica + autenticacao,
tudo hospedado por eles. O front-end conversa com ele pela internet.

---

## Quem faz o que

| Pessoa | Faz | Precisa de |
|---|---|---|
| Quem programa (no Live Share ou na propria maquina) | Escreve o codigo e as migrations do banco | Git |
| Quem faz o deploy | Manda as migrations para o Supabase e confere no painel | Git + login no Supabase |

O codigo viaja de uma maquina para outra **pelo Git**. Deploy so funciona com o codigo
na maquina de quem esta deployando — por isso o fluxo e sempre:

```
amigo programa  →  amigo aperta Ctrl+Shift+B  (commita e envia)
                        ↓
você aperta Ctrl+Shift+B  (puxa o codigo dele)
                        ↓
você roda a task "Deploy no Supabase"
                        ↓
abre o painel do Supabase e ve funcionando
```

---

## Configurar uma vez (quem faz o deploy)

### 1. Criar o projeto no Supabase
1. https://supabase.com → **Start your project** → entrar com o GitHub
2. **New project** → nome `inovaapss`, regiao **South America (Sao Paulo)**
3. **Guarde a senha do banco** (Database Password) — vai precisar dela no passo 3

### 2. Entrar pela CLI
```powershell
npx supabase login
```
Abre o navegador, voce autoriza, pronto.

### 3. Conectar esta pasta ao projeto
O `project-ref` e o codigo que aparece na URL do painel:
`https://supabase.com/dashboard/project/`**`abcdefghijklmnop`**

```powershell
npx supabase link --project-ref abcdefghijklmnop
```
Ele pede a senha do banco (a do passo 1).

### 4. Chaves para o front-end
Copie `.env.example` para `.env` e preencha com o que esta em
**Project Settings → API** no painel: a URL e a chave **anon / public**.

> O `.env` nao vai para o GitHub. Nunca cole chaves direto no codigo.
> A chave **service_role** nunca vai para o front-end — ela ignora todas as regras de seguranca.

---

## Dia a dia: mudar o banco

Toda mudanca no banco (criar tabela, adicionar coluna...) e um **arquivo de migration**.
Migration e so um `.sql` com data no nome, dentro de `supabase/migrations/`.
Como e arquivo, vai pelo Git — quem programa cria, quem deploya aplica.

### Criar uma migration
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

### Aplicar no Supabase (deploy)
No VSCode: `Ctrl+Shift+P` → **Tasks: Run Task** → **Deploy no Supabase**.
Ou no terminal:
```powershell
npm run deploy
```
Ele aplica **so as migrations que ainda nao foram aplicadas**, na ordem.

> **Cuidado:** o deploy nao apaga nada sozinho — mas uma migration com `drop table` apaga.
> Leia o SQL antes de deployar.

---

## Ver funcionando

Tudo no painel https://supabase.com/dashboard:

| Onde | O que voce ve |
|---|---|
| **Table Editor** | As tabelas e os dados, como uma planilha |
| **SQL Editor** | Roda qualquer consulta na hora |
| **Logs** | Erros e chamadas da API em tempo real |
| **API Docs** | A documentacao da API gerada automaticamente para cada tabela |

---

## Edge Functions (opcional)

Codigo que roda no servidor do Supabase (TypeScript/Deno). Util para logica que
nao pode ficar no front-end, como falar com APIs externas usando chaves secretas.

```powershell
npx supabase functions new minha-funcao      # cria supabase/functions/minha-funcao/index.ts
npm run deploy:functions                     # envia todas as functions
```

---

## Rodar o Supabase localmente (opcional, nao precisa)

`npx supabase start` sobe um Supabase completo na sua maquina, mas exige **Docker Desktop**.
Para este projeto **nao precisa**: deployamos direto no projeto hospedado.

---

## Problemas comuns

| Mensagem | Causa | Solucao |
|---|---|---|
| `Access token not provided` | Nao fez login | `npx supabase login` |
| `Cannot find project ref` | Pasta nao esta conectada ao projeto | `npx supabase link --project-ref ...` |
| `password authentication failed` | Senha do banco errada | Painel → Project Settings → Database → Reset password |
| `migration ... already exists` | Migration com o mesmo nome | Use outro nome |
