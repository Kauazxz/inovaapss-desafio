# Como o grupo trabalha neste projeto

Nosso modelo: **Live Share para programar junto em tempo real + commits direto na `main`.**

E rapido, mas tem um risco real: como todo mundo escreve no mesmo lugar, e facil
**sobrescrever o trabalho do colega**. Este guia existe para isso nao acontecer.

---

## 1. Live Share — programar juntos ao mesmo tempo

O Git **nao** serve para digitar junto. Quem faz isso e o Live Share.

### Quem hospeda a sessao (1 pessoa)

1. Abra a pasta do projeto no VSCode.
2. `Ctrl+Shift+P` → digite **Live Share: Start Collaboration Session**.
3. Faca login com a conta do GitHub.
4. O link e copiado automaticamente — cole no grupo do WhatsApp/Discord.

### Quem entra (todo o resto do time)

1. Clique no link, **ou** `Ctrl+Shift+P` → **Live Share: Join Collaboration Session** e cole o link.
2. Pronto — voce ve o cursor de todo mundo, ao vivo.

### Regras do Live Share

- **Quem hospeda e quem commita.** Os arquivos existem de verdade so na maquina de quem hospeda.
  Se quem hospedou fechar o VSCode sem commitar, **o trabalho de todos se perde**.
- Avise no chat qual arquivo voce vai mexer. Dois cursores no mesmo `<div>` = briga.
- Commite a cada ~20-30 minutos de sessao. Nao deixe para o final.

---

## 2. Git na `main` — as 3 regras de ouro

### Regra 1 — SEMPRE sincronize antes de comecar

Antes de escrever a primeira linha do dia:

```powershell
pnpm sync
```

Isso puxa o que os outros fizeram. Pular esse passo e a causa n1 de conflito.

### Regra 2 — Commits pequenos e frequentes

Um commit por tarefa concluida, nao um commit gigante no fim do dia.
Commit pequeno = conflito pequeno = facil de resolver.

```bash
git add .
git commit -m "feat(auth): add login page"
```

### Regra 3 — SEMPRE sincronize antes de enviar

```powershell
pnpm sync
```

O script puxa o trabalho dos outros **e depois** envia o seu. Nessa ordem, ninguem sobrescreve ninguem.

> **Nunca use `git push --force` na `main`.** Isso apaga o trabalho do grupo do servidor.

---

## 3. Padrao de mensagem de commit

Formato (Conventional Commits): `tipo(escopo): o que foi feito` — a **primeira linha em ingles**,
curta e no imperativo. O escopo e opcional (modulo ou etapa: `auth`, `metrics`, `etapas`, `repo`).
O corpo do commit, se precisar, pode ser em portugues.

| Tipo       | Quando usar                                | Exemplo                                                    |
| ---------- | ------------------------------------------ | ---------------------------------------------------------- |
| `feat`     | Funcionalidade nova                        | `feat(auth): add supabase authentication and tenant guard` |
| `fix`      | Correcao de bug                            | `fix(imports): reject rows with empty client code`         |
| `style`    | Visual / CSS                               | `style(dashboard): align risk table columns`               |
| `docs`     | Documentacao                               | `docs(etapas): start stage 2`                              |
| `refactor` | Melhora o codigo sem mudar o comportamento | `refactor(scoring): split trend and persistence helpers`   |
| `test`     | So testes                                  | `test(engine): cover missed meetings with zero planned`    |
| `chore`    | Configuracao, dependencias                 | `chore(repo): initialize monorepo and tooling`             |
| `ci`       | Workflows do GitHub Actions                | `ci: add validation workflow`                              |

Mais exemplos na [SPEC.md, §48](SPEC.md#48-cicd-e-commits-automáticos).

**Autor unico.** Todo commit deste repositorio sai como **Kauazxz** (a identidade fica configurada
dentro da pasta do projeto, sem `--global`). Sem `Co-Authored-By`, `Signed-off-by` nem outros trailers.
O hook `commit-msg` rejeita mensagem fora do padrao ou com trailer: e so escrever de novo. `--no-verify`
e proibido.

---

## 4. Deu conflito. E agora?

Calma — conflito e normal, nao e erro de ninguem.

O Git marca o arquivo assim:

```
<<<<<<< HEAD
codigo que VOCE escreveu
=======
codigo que o COLEGA escreveu
>>>>>>> abc1234
```

**Passo a passo:**

1. Abra o arquivo no VSCode — ele mostra os botoes `Accept Current` / `Accept Incoming` / `Accept Both`.
2. **Fale com quem escreveu a outra parte antes de apagar qualquer coisa.**
3. Deixe o arquivo do jeito certo e apague as linhas `<<<<<<<`, `=======`, `>>>>>>>`.
4. Finalize:
   ```bash
   git add .
   git rebase --continue
   ```

**Se travar de vez e quiser voltar atras sem perder nada:**

```bash
git rebase --abort
```

Isso cancela a sincronizacao e devolve tudo como estava. Seu trabalho continua intacto.

---

## 5. Socorro — comandos de emergencia

| Situacao                                                         | Comando                       |
| ---------------------------------------------------------------- | ----------------------------- |
| Ver o que mudou antes de commitar                                | `git status` e `git diff`     |
| Desfazer alteracao de um arquivo que ainda **nao** foi commitada | `git restore nome-do-arquivo` |
| Desfazer o ultimo commit mas **manter** o codigo                 | `git reset --soft HEAD~1`     |
| "Perdi meu trabalho!" — historico de tudo que o Git ja viu       | `git reflog`                  |
| Ver quem escreveu cada linha                                     | `git blame nome-do-arquivo`   |

> `git reflog` guarda quase tudo por ~30 dias. Antes de entrar em panico, rode ele.

---

## 6. Nunca commite

- Arquivos `.env`, senhas, chaves de API, tokens, credenciais de banco.
- `node_modules/`, `.venv/`, `dist/`, `build/` — o [`.gitignore`](../.gitignore) ja bloqueia.
- Arquivos gigantes (videos, dumps de banco). O GitHub recusa acima de 100 MB.

Se vazar uma senha no commit, **avise o grupo na hora** — trocar a senha e obrigatorio, apagar o commit nao basta.
