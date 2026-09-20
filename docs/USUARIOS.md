# Usuários, papéis e permissões

Quem entra na plataforma pela sua organização, o que cada papel pode fazer e como convidar
alguém. Base: [SPEC.md](SPEC.md) §4 (modelo multiempresa), §5 (auth e RBAC) e §36
(`organization_users`).

A tela fica em **Configurações → Usuários** (`/settings`).

---

## 1. Os quatro papéis

| Papel       | O que é                                                                                                                                         |
| ----------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| **owner**   | Dona da conta: faz tudo, inclusive gerenciar usuários e transferir a posse.                                                                     |
| **admin**   | Gerencia a operação inteira: clientes, métricas, modelos, importações e usuários.                                                               |
| **analyst** | Trabalha a carteira: cadastra e edita clientes e contratos, importa dados e trata alertas, mas não mexe em usuários nem ativa versão de modelo. |
| **viewer**  | Só leitura: vê o painel, os clientes e os alertas, e não altera nada.                                                                           |

O papel pertence ao **vínculo** entre a pessoa e a organização, não à conta: a mesma conta do
Supabase Auth pode ter papéis diferentes em organizações diferentes.

---

## 2. Quem pode o quê

Esta tabela foi escrita lendo os `requireRole` da API em 20/09/2026 — ela descreve o que o
código realmente aplica, não uma intenção. A mesma tabela aparece na tela de usuários
(`apps/web/src/features/settings/roles.ts`).

| Ação                                      | owner | admin | analyst | viewer | Onde a API exige                                           |
| ----------------------------------------- | :---: | :---: | :-----: | :----: | ---------------------------------------------------------- |
| Ver o painel e os clientes                |  sim  |  sim  |   sim   |  sim   | `GET /dashboard/*` e `GET /clients` pedem só o vínculo     |
| Tratar alertas                            |  sim  |  sim  |   sim   |  não   | `PATCH /alerts/:id`                                        |
| Editar clientes e contratos               |  sim  |  sim  |   sim   |  não   | `POST/PATCH/DELETE` de `/clients`, `/contracts` e `/plans` |
| Importar dados                            |  sim  |  sim  |   sim   |  não   | `POST /documents` e a extração de métricas                 |
| Editar métricas e ativar versão do modelo |  sim  |  sim  |   não   |  não   | `POST/PATCH/DELETE` de `/metrics` e `/metric-models`       |
| Gerenciar usuários                        |  sim  |  sim  |   não   |  não   | `POST/PATCH/DELETE` de `/organizations/current/users`      |

Duas observações honestas sobre a linha **Importar dados**:

- a rota dedicada de importação (`/imports`) ainda não existe; hoje o que a API exige do papel
  é o envio de documentos (`POST /documents`, `owner`/`admin`/`analyst`). Quando o importador
  entrar, a linha vale para ele do mesmo jeito — mas confirme o `requireRole` da rota nova;
- o recálculo do scoring ainda é um script (`pnpm --filter @inovaapss/api recalculate`), não
  uma rota, então não tem papel associado.

Duas regras adicionais, que não cabem numa coluna:

- **só o owner nomeia outro owner** e só o owner muda o papel de um owner;
- **a organização nunca fica sem owner**: o último owner não consegue se rebaixar nem ser
  removido (a API responde `409 LAST_OWNER`).

---

## 3. Como convidar

1. abra **Configurações → Usuários** e clique em **Convidar usuários**;
2. escreva os e-mails — **um por linha**, ou separados por vírgula/ponto e vírgula;
3. escolha o papel (o mesmo para todos os e-mails daquele envio);
4. clique em **Enviar convites**.

Cada e-mail vira uma requisição e uma linha de resultado. Um e-mail recusado (já é membro,
formato inválido) **não impede os outros de entrar**; os que falharam continuam na caixa para
você corrigir e reenviar.

Quem ainda não tem conta recebe um convite do Supabase Auth e **define a própria senha pelo
link**. A plataforma nunca cria uma conta com senha em nome de outra pessoa, e a resposta do
convite é idêntica exista ou não a conta — assim a rota não serve de oráculo de "este e-mail já
está na plataforma?" entre organizações.

Para mudar o papel de alguém ou tirar o acesso, use os botões da linha da pessoa; os dois pedem
confirmação. Remover o acesso apaga só o vínculo: a conta continua existindo e pode voltar com
um novo convite.

---

## 4. Rotas da API

| Método   | Rota                                              | Quem pode       |
| -------- | ------------------------------------------------- | --------------- |
| `GET`    | `/api/v1/organizations/current/users`             | qualquer membro |
| `POST`   | `/api/v1/organizations/current/users`             | owner, admin    |
| `PATCH`  | `/api/v1/organizations/current/users/:authUserId` | owner, admin    |
| `DELETE` | `/api/v1/organizations/current/users/:authUserId` | owner, admin    |

Erros específicos:

| Código               | Status | Quando                                                       |
| -------------------- | ------ | ------------------------------------------------------------ |
| `ALREADY_MEMBER`     | 409    | o e-mail já tem vínculo com esta organização                 |
| `AUTH_INVITE_FAILED` | 409    | o Supabase Auth recusou o convite                            |
| `CANNOT_CHANGE_SELF` | 403    | tentativa de remover o próprio acesso                        |
| `LAST_OWNER`         | 409    | a mudança deixaria a organização sem nenhum owner            |
| `FORBIDDEN`          | 403    | papel insuficiente (inclui "só o owner mexe em outro owner") |
| `NOT_FOUND`          | 404    | o usuário não faz parte desta organização                    |

As proteções vivem no **service** (`apps/api/src/modules/organizations/service.ts`), não na
tela: a API recusa mesmo que a requisição venha de fora do produto.

---

## 5. Transferir a posse

1. o owner atual promove a outra pessoa a **owner** (agora a organização tem dois);
2. o novo owner rebaixa o antigo para `admin` — ou o antigo se rebaixa sozinho, o que agora é
   permitido porque já existe outro owner.

O passo 1 antes do 2 é obrigatório: com um único owner, a API barra a mudança com `LAST_OWNER`.
