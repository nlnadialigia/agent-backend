# Plataforma do Agente Autônomo de Backend

<div align="center">

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Node.js Version](https://img.shields.io/badge/Node.js-LTS%20(v26)-339933?logo=node.js&logoColor=white)](https://nodejs.org/)
[![pnpm](https://img.shields.io/badge/pnpm-12.x-F69220?logo=pnpm&logoColor=white)](https://pnpm.io/)
[![NestJS](https://img.shields.io/badge/NestJS-10.x-E0234E?logo=nestjs&logoColor=white)](https://nestjs.com/)
[![React](https://img.shields.io/badge/React-18.x-61DAFB?logo=react&logoColor=black)](https://react.dev/)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-18-4169E1?logo=postgresql&logoColor=white)](https://www.postgresql.org/)
[![Prisma](https://img.shields.io/badge/Prisma-5.x-2D3748?logo=prisma&logoColor=white)](https://www.prisma.io/)
[![Validation Zod](https://img.shields.io/badge/Validation-Zod-3068B7?logo=zod&logoColor=white)](https://zod.dev/)
[![Docker Compose](https://img.shields.io/badge/Docker-Compose-2496ED?logo=docker&logoColor=white)](https://docs.docker.com/compose/)
[![AI Engine](https://img.shields.io/badge/AI-Gemini%202.5%20Pro-8E75C2?logo=google&logoColor=white)](https://aistudio.google.com/)

</div>

Plataforma completa para orquestração de desenvolvimento autônomo com foco exclusivo em backend (Node.js / TypeScript), integração com **Kanbanize**, **Google Gemini**, **Azure DevOps** e portão interativo de aprovação humana (**Human-in-the-Loop**).

---

## 🚀 Arquitetura e Stack

- **Backend:** NestJS com TypeScript, Prisma ORM, WebSocket Gateway (Socket.io) para streaming de logs e execução em background.
- **Frontend:** React + Vite, Tailwind CSS, componentes shadcn/ui com Terminal de logs em tempo real, visualizador de diagnóstico com aprovação/rejeição e listagem de repositórios.
- **Banco de Dados:** PostgreSQL 18 (persistência de histórico e cache estrutural de repositórios).
- **Gerenciador de Pacotes:** `pnpm` (monorepo com workspaces).
- **Orquestração Local:** Docker Compose com montagem de diretórios locais de código do desenvolvedor (`/workspace/repos`).

---

## 📦 Como Subir a Aplicação Localmente

### 1. Pré-requisitos
- Docker e Docker Compose instalados.
- Arquivo `.env` configurado (criado a partir de `.env.example`).

### 2. Inicialização dos Contêineres
Na raiz do projeto:
```bash
docker compose up -d
```

### 3. Acessos
- **Aplicação Web (Frontend):** [http://localhost:3000](http://localhost:3000)
- **API NestJS (Backend):** [http://localhost:3333](http://localhost:3333)
- **PostgreSQL 18:** `localhost:5432`

---

## ⚡ Cache Estrutural de Repositórios

O agente realiza o escaneamento determinístico do repositório vinculado à tarefa (lendo `package.json`, layout de diretórios, linter e test runner).

1. Na **primeira execução**, o perfil arquitetural é gerado e salvo no PostgreSQL com o hash atual do commit (`git rev-parse HEAD`).
2. Em **tarefas subsequentes** no mesmo repositório, o agente detecta que o commit não mudou e reutiliza instantaneamente o perfil em cache (`isCached: true`), sem nenhum custo de tokens de IA.

---

## 📚 Documentação e Especificações

- [spec_agent_backend.md](./specs-backend/spec_agent_backend.md): Especificação técnica detalhada do agente backend.
- [requisitos_instalacao_tokens.md](./specs-backend/requisitos_instalacao_tokens.md): Guia de obtenção de credenciais, tokens e comandos de validação.
- [roadmap_desenvolvimento.md](./specs-backend/roadmap_desenvolvimento.md): Roteiro de fases e critérios de aceite.
- [spec_web_app.md](./instructions/spec_web_app.md): Especificação técnica da interface web e Docker Compose.

---

## 📄 Licença

Este projeto está sob a licença [MIT](./LICENSE). Consulte o arquivo [LICENSE](./LICENSE) para mais detalhes.
