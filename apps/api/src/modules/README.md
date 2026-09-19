# Módulos da API

Cada domínio (§3 da spec) vive numa pasta própria aqui, com **MVC modular**:

```text
<modulo>/
├─ routes.ts       ← registra as rotas Express e liga ao controller
├─ controller.ts   ← recebe o request, valida com Zod (schema.ts), chama o service, responde. SEM regra de negócio
├─ service.ts      ← casos de uso; chama o repository e o engine (lógica pura em packages/engine)
├─ repository.ts   ← só persistência (Drizzle), sempre filtrando por organization_id
├─ schema.ts       ← schemas Zod de entrada/saída (reaproveita @inovaapss/validation)
├─ types.ts        ← tipos locais do módulo
└─ __tests__/      ← Vitest + Supertest
```

Para ligar um módulo:

1. crie `src/db/schema/<modulo>.ts` e acrescente `export * from './<modulo>.js';` em `src/db/schema/index.ts`;
2. registre o router em `src/routes/api-v1.ts` (`router.use('/<recurso>', ...)`) e a entrada em `ROUTES`;
3. documente as rotas em `src/openapi.ts`;
4. gere a migration: `pnpm --filter @inovaapss/api db:generate`.

Módulos previstos: `auth`, `organizations`, `portfolio-clients`, `contracts`, `metrics`, `scoring`,
`sla`, `imports`, `documents`, `alerts`, `recommendations`, `calibration`, `dashboard`.
