# Comecar aqui

Guia para entrar no projeto do zero. Se voce acabou de ser chamado para o time, e por aqui que comeca.

---

## Parte 1 — Instalar (so uma vez)

| O que | Onde | Conferir se deu certo |
|---|---|---|
| **Git** | https://git-scm.com/download/win | `git --version` |
| **VSCode** | https://code.visualstudio.com | abrir o programa |
| **GitHub CLI** | https://cli.github.com | `gh --version` |

> **Atencao:** se voce ja tinha VSCode instalado ha muito tempo, confira a versao em
> **Help → About**. Precisa ser 1.100 ou maior. Versoes antigas nao rodam Live Share.

## Parte 2 — Baixar o projeto

Abra o terminal (PowerShell) e rode:

```powershell
cd ~/Documents
git clone https://github.com/Kauazxz/inovaapss.git
cd inovaapss
code .
```

Quando o VSCode abrir, vai aparecer um aviso no canto inferior direito perguntando se
voce quer instalar as extensoes recomendadas. **Clique em "Install".**

## Parte 3 — Dizer ao Git quem voce e

Isso e o que faz seu nome aparecer nos commits. Use o **mesmo e-mail da sua conta do GitHub**:

```powershell
git config --global user.name "Seu Nome"
git config --global user.email "seu-email@exemplo.com"
```

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
./sync.ps1
```

Se aparecer "Tudo sincronizado", esta tudo certo.

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

`Ctrl+Shift+B` roda o [`sync.ps1`](../sync.ps1), que faz tudo na ordem segura:
commita o seu → puxa o do colega → envia o seu.
Nessa ordem, **ninguem sobrescreve ninguem**.

> Prefere o terminal? E o mesmo que rodar `./sync.ps1`.

### Antes de dividir tarefas, combinem os arquivos

Como voces commitam direto na `main`, a maior fonte de dor de cabeca e
**duas pessoas editando o mesmo arquivo ao mesmo tempo, cada uma na sua maquina**.

Combinem no chat:
- "eu mexo em `login.js`"
- "eu mexo em `banco.py`"

Arquivos diferentes = zero conflito. Mesmo arquivo = melhor chamar no Live Share.

---

## Qual modo usar?

| Situacao | Modo |
|---|---|
| Travamos no mesmo bug | Live Share |
| Um esta ensinando o outro | Live Share |
| Vamos mexer no mesmo arquivo | Live Share |
| Dividimos tarefas diferentes | Cada um na sua + `Ctrl+Shift+B` |
| Estou codando de madrugada e o outro dorme | Cada um na sua + `Ctrl+Shift+B` |

---

## Deu problema?

- **Conflito no Git** → [COMO-TRABALHAR.md, secao 4](COMO-TRABALHAR.md#4-deu-conflito-e-agora)
- **"Permission denied" ao enviar** → sua conta nao tem acesso de escrita. Fale com o dono do repo.
- **"Perdi meu codigo!"** → rode `git reflog`. O Git guarda quase tudo por ~30 dias.

Regras completas do dia a dia em **[COMO-TRABALHAR.md](COMO-TRABALHAR.md)**.
