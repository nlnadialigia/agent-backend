FROM node:20-alpine AS build

RUN npm install -g pnpm@12.16.1

WORKDIR /app

# Copia configurações do monorepo e lockfile
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml* ./
COPY apps/web/package.json ./apps/web/
COPY apps/api/package.json ./apps/api/

# Instala dependências aprovando builds
RUN pnpm approve-builds --all && pnpm install

# Copia código fonte do frontend
COPY apps/web ./apps/web

# Constrói o frontend
WORKDIR /app/apps/web
RUN pnpm build

EXPOSE 3000

CMD ["pnpm", "preview", "--host", "--port", "3000"]
