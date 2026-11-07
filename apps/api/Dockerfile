FROM node:lts-alpine AS base

# Instala Git e dependências do sistema
RUN apk add --no-cache git bash curl openssh openssl && \
    git config --system --add safe.directory '*'

RUN npm install -g pnpm@12.16.1

WORKDIR /app

# Copia configurações do monorepo e lockfile
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml* ./
COPY apps/api/package.json ./apps/api/
COPY apps/web/package.json ./apps/web/

# Instala dependências aprovando builds
RUN pnpm approve-builds --all && pnpm install

# Copia código fonte da API
COPY apps/api ./apps/api

# Gera cliente Prisma e constrói a API
WORKDIR /app/apps/api
RUN pnpm prisma:generate
RUN pnpm build

EXPOSE 3333

CMD ["node", "dist/main.js"]
