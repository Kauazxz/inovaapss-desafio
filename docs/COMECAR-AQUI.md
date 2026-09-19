# Comecar aqui

Guia para entrar no projeto do zero. Se voce acabou de ser chamado para o time, e por aqui que comeca.

---

## Parte 1 — Instalar (so uma vez)

| O que                | Onde                                               | Conferir se deu certo                        |
| -------------------- | -------------------------------------------------- | -------------------------------------------- |
| **Git**              | https://git-scm.com/download/win                   | `git --version`                              |
| **Node.js 22** (LTS) | https://nodejs.org                                 | `node --version` (tem que comecar com `v22`) |
| **pnpm**             | no terminal, depois do Node: `npm install -g pnpm` | `pnpm --version`                             |
| **VSCode**           | https://code.visualstudio.com                      | abrir o programa                             |
| **GitHub CLI**       | https://cli.github.com                             | `gh --version`                               |

> **PowerShell reclamou que "pnpm.ps1 nao pode ser carregado"?** Rode uma vez e feche/abra o terminal:
>
> ```powershell
> Set-ExecutionPolicy -Scope CurrentUser RemoteSigned
> ```

> **Atencao:** se voce ja tinha VSCode instalado ha muito tempo, confira a versao em
> **Help → About**. Precisa ser 1.100 ou maior. Versoes antigas nao rodam Live Share.

## Parte 2 — Baixar o projeto

Abra o terminal (PowerShell) e rode:

```powershell
cd ~/Documents
git clone https://github.com/Kauazxz/inovaapss-desafio.git
cd inovaapss-desafio
pnpm install
code .
```

O `pnpm install` baixa tudo de uma vez: a API, o site, os pacotes compartilhados e a CLI do Supabase.
Leva alguns minutos na primeira vez.

Quando o VSCode abrir, vai aparecer um aviso no canto inferior direito perguntando se
voce quer instalar as extensoes recomendadas. **Clique em "Install".**

## Parte 3 — Dizer ao Git quem assina os commits

Regra do time: **todo commit deste projeto sai como Kauazxz**, um unico autor (ajuste A6 da spec).
Configure **dentro da pasta do projeto, sem `--global`** — assim nao muda nada nos seus outros
repositorios:

```powershell
git config user.name "Kauazxz"
git config user.email "122256165+Kauazxz@users.noreply.github.com"
```

Confira com `git config user.name` (tem que responder `Kauazxz`).

## Parte 4 — Conectar ao GitHub

```powershell
gh auth login
```

Responda: `GitHub.com` → `HTTPS` → `Y` → `Login with a web browser` → siga as instrucoes.

Depois:

```powershell
gh auth setup-git
```

Teste se funcionou:

```powershell
pnpm sync
```

Se aparecer "Tudo sincronizado", esta tudo certo.

## Parte 4b — As regras de commit (3 linhas)

1. **Mensagem no padrao Conventional Commits**: `tipo(escopo): o que foi feito`, primeira linha em
   ingles — ex.: `feat(auth): add login page`. A tabela de tipos esta em
   [COMO-TRABALHAR.md, secao 3](COMO-TRABALHAR.md#3-padrao-de-mensagem-de-commit).
2. **Um unico autor**: todo commit sai como **Kauazxz** (Parte 3). Sem `Co-Authored-By` nem outros
   trailers no fim da mensagem.
3. **O hook confere**: mensagem fora do padrao ou com trailer e rejeitada na hora. Nao e erro seu —
   e so escrever de novo no formato certo. Nunca use `--no-verify`.

## Parte 4c — Supabase

**Voce nao precisa configurar nada.** O deploy do banco e automatico: quando alguem envia
um commit que mexe em `supabase/`, o GitHub Actions aplica no Supabase sozinho.

So **uma** pessoa do time configura isso, **uma vez** (criar o projeto e guardar 3 segredos
no GitHub). O passo a passo esta em **[SUPABASE.md](SUPABASE.md)**.

---

# Parte 5 — Como a gente programa junto

Existem **dois modos**. Eles servem para coisas diferentes — use os dois.

## Modo 1: Live Share — juntos, ao vivo, no mesmo arquivo

Use quando estiverem **resolvendo o mesmo problema** ou quando um esta ensinando o outro.
Os dois digitam no mesmo arquivo ao mesmo tempo, como no Google Docs.

**Quem hospeda** (escolham 1 pessoa):

1. `Ctrl+Shift+P` → **Live Share: Start Collaboration Session**
2. O link e copiado sozinho. Cole no WhatsApp/Discord do grupo.

**Quem entra:**

1. Clique no link que recebeu.

### A regra que salva o trabalho de voces

> No Live Share, os arquivos existem **de verdade so na maquina de quem hospeda**.
> Quem entra esta apenas "enxergando" a maquina do outro.
>
> Se quem hospedou fechar o VSCode sem commitar, **some o trabalho dos dois**.

Por isso: **quem hospeda commita**, e commita a cada 20-30 minutos.
`Ctrl+Shift+B` faz isso e ja envia para o GitHub.

## Modo 2: Cada um na sua maquina — separados

Use quando estiverem em **horarios diferentes** ou **dividindo tarefas**
("voce faz a tela de login, eu faco o banco").

Aqui cada um tem sua propria copia dos arquivos, e o Git junta tudo.

### A rotina, todo dia

```
1. ANTES de comecar     ->  Ctrl+Shift+B   (puxa o que o colega fez)
2. Programa
3. DEPOIS de terminar   ->  Ctrl+Shift+B   (envia o que voce fez)
```

`Ctrl+Shift+B` roda o [`sync.js`](../sync.js), que faz tudo na ordem segura:
commita o seu → puxa o do colega → envia o seu.
Nessa ordem, **ninguem sobrescreve ninguem**.

> Prefere o terminal? E o mesmo que rodar `pnpm sync`.

### Antes de dividir tarefas, combinem os arquivos

Como voces commitam direto na `main`, a maior fonte de dor de cabeca e
**duas pessoas editando o mesmo arquivo ao mesmo tempo, cada uma na sua maquina**.

Combinem no chat:

- "eu mexo em `apps/web/src/features/auth/`"
- "eu mexo em `apps/api/src/modules/metrics/`"

Arquivos diferentes = zero conflito. Mesmo arquivo = melhor chamar no Live Share.

A divisao oficial e por **etapa**: cada etapa tem a lista de pastas que possui em
**[ETAPAS.md](ETAPAS.md)**. Pegou uma etapa, marca la e mexe so naquelas pastas.

---

## Qual modo usar?

| Situacao                                   | Modo                            |
| ------------------------------------------ | ------------------------------- |
| Travamos no mesmo bug                      | Live Share                      |
| Um esta ensinando o outro                  | Live Share                      |
| Vamos mexer no mesmo arquivo               | Live Share                      |
| Dividimos tarefas diferentes               | Cada um na sua + `Ctrl+Shift+B` |
| Estou codando de madrugada e o outro dorme | Cada um na sua + `Ctrl+Shift+B` |

---

## Deu problema?

- **Conflito no Git** → [COMO-TRABALHAR.md, secao 4](COMO-TRABALHAR.md#4-deu-conflito-e-agora)
- **"Permission denied" ao enviar** → sua conta nao tem acesso de escrita. Fale com o dono do repo.
- **"Perdi meu codigo!"** → rode `git reflog`. O Git guarda quase tudo por ~30 dias.

Regras completas do dia a dia em **[COMO-TRABALHAR.md](COMO-TRABALHAR.md)**.
