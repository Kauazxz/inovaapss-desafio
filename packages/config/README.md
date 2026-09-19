# @inovaapss/config

Configurações compartilhadas do monorepo.

| Arquivo               | Quem estende                                   |
| --------------------- | ---------------------------------------------- |
| `tsconfig/base.json`  | ninguém diretamente; é a base estrita dos dois |
| `tsconfig/node.json`  | `apps/api` e `packages/*`                      |
| `tsconfig/react.json` | `apps/web`                                     |

Uso em um `tsconfig.json`:

```json
{ "extends": "@inovaapss/config/tsconfig/node.json" }
```

ESLint e Prettier ficam na raiz do repositório (`eslint.config.mjs`, `.prettierrc`) e valem para
todos os pacotes.
