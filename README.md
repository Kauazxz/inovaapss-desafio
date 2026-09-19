# inovaapss

Projeto do grupo para o desafio.

> **Status:** aguardando o briefing oficial do desafio.
> Assim que recebermos o enunciado, definimos aqui: stack, banco de dados e hospedagem.

---

## Sobre o desafio

| | |
|---|---|
| **Desafio** | _a preencher_ |
| **Entrega** | _a preencher_ |
| **Objetivo** | _a preencher_ |

## O time

| Nome | GitHub | Responsavel por |
|---|---|---|
| Kaua Araujo | [@Kauazxz](https://github.com/Kauazxz) | _a definir_ |
| Luiz Araujo | [@luizaraujoengkil-ux](https://github.com/luizaraujoengkil-ux) | _a definir_ |
| _a preencher_ | | |

## Stack

- **Back-end / banco de dados:** [Supabase](https://supabase.com) (Postgres + API + Auth) — **definido**
- **Front-end:** _a definir depois do briefing_
- **Hospedagem do front-end:** _a definir_

O deploy do banco e feito pela CLI do Supabase, que ja vem instalada com `npm install`.
Guia completo em **[docs/SUPABASE.md](docs/SUPABASE.md)**.

---

## Comecando

Primeira vez no projeto? Siga o **[docs/COMECAR-AQUI.md](docs/COMECAR-AQUI.md)** —
instalacao, clone, conexao com o GitHub e como a gente programa junto.

## Como a gente trabalha

Dois modos, para situacoes diferentes:

| Situacao | Como |
|---|---|
| Resolver o mesmo problema juntos, ao vivo | **Live Share** (`Ctrl+Shift+P` → *Live Share: Start Collaboration Session*) |
| Tarefas divididas, horarios diferentes | Cada um na sua maquina + **`Ctrl+Shift+B`** para sincronizar |

**`Ctrl+Shift+B`** roda o [`sync.ps1`](sync.ps1): commita o seu trabalho, puxa o do
colega e envia o seu — nessa ordem, para ninguem sobrescrever ninguem.
Rode **antes de comecar** e **depois de terminar**.

**Deploy no Supabase:** `Ctrl+Shift+P` → *Tasks: Run Task* → **Deploy no Supabase**
(ou `npm run deploy`). Aplica as migrations de `supabase/migrations/` no projeto hospedado.

Commitamos direto na `main`, sem branch por pessoa. As regras completas
(padrao de commit, o que fazer no conflito, comandos de emergencia) estao em
**[docs/COMO-TRABALHAR.md](docs/COMO-TRABALHAR.md)**.
