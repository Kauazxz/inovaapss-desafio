# Imagem da API (@inovaapss/api). Contexto de build = RAIZ do monorepo:
#   docker build -f apps/api/Dockerfile -t inovaapss-api .
# (Render/Railway: "Dockerfile path" = apps/api/Dockerfile, "root directory" = raiz do repo.)
#
# Etapas:
#   1. deps   - instala só o que @inovaapss/api e os packages que ela usa precisam
#   2. build  - compila packages/shared, packages/validation e apps/api (tsc)
#   3. prod   - `pnpm deploy --prod` copia dist + dependências de produção para /out/api
#   4. runner - imagem final enxuta, usuário não-root, só o que está em /out/api
#
# `--legacy` no deploy: a partir do pnpm 10 o comando exige `inject-workspace-packages=true`
# no .npmrc ou essa flag; a flag evita mexer na configuração global do monorepo.
# A versão do pnpm vem do campo "packageManager" do package.json da raiz.

ARG NODE_IMAGE=node:22-alpine

# ---------- 1. deps ----------
FROM ${NODE_IMAGE} AS deps
RUN corepack enable
WORKDIR /repo

# Só os manifests: a camada de dependências é reaproveitada enquanto eles não mudarem.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
COPY packages/config/package.json packages/config/
COPY packages/shared/package.json packages/shared/
COPY packages/validation/package.json packages/validation/
COPY apps/api/package.json apps/api/

RUN pnpm install --frozen-lockfile --filter @inovaapss/api...

# ---------- 2. build ----------
FROM deps AS build
COPY packages/config packages/config
COPY packages/shared packages/shared
COPY packages/validation packages/validation
COPY apps/api apps/api

# Compila as dependências do workspace primeiro (a api depende dos dist/ delas).
RUN pnpm --filter @inovaapss/api... run build

# ---------- 3. prod ----------
FROM build AS prod
RUN pnpm --filter @inovaapss/api deploy --prod --legacy /out/api

# ---------- 4. runner ----------
FROM ${NODE_IMAGE} AS runner
ENV NODE_ENV=production
ENV PORT=3001
WORKDIR /app

COPY --from=prod --chown=node:node /out/api ./

USER node
EXPOSE 3001

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://127.0.0.1:3001/health || exit 1

CMD ["node", "dist/server.js"]
