# Contexto de build: raiz do monorepo (docker-compose.yml).
FROM node:24-alpine
RUN npm i -g pnpm@10.34.7
WORKDIR /app

COPY pnpm-lock.yaml pnpm-workspace.yaml package.json tsconfig.base.json ./
COPY packages/shared/package.json packages/shared/
COPY apps/server/package.json apps/server/
RUN pnpm install --frozen-lockfile --filter @islabr/server...

COPY packages/shared packages/shared
COPY apps/server apps/server

ENV NODE_ENV=production PORT=2567
EXPOSE 2567
CMD ["pnpm", "--filter", "@islabr/server", "start"]
