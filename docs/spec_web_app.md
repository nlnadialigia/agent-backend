# Especificação Técnica: Aplicação Web Local para Orquestração do Agente Autônomo

Documento de especificação técnica, arquitetura de software e infraestrutura local (Docker Compose) para a aplicação web que orquestra o **Agente de Backend Autônomo**.

---

## 1. Visão Geral da Solução

* **Objetivo:** Fornecer uma interface visual moderna e local para disparo de tarefas do Kanbanize, visualização em tempo real dos logs do agente, inspeção dos diagnósticos gerados com portão de aprovação interativo (Human-in-the-Loop) e gerenciamento de repositórios com cache estrutural.
* **Stack Tecnológica:**
  * **Backend:** [NestJS](https://nestjs.com/) com TypeScript, Prisma ORM e WebSockets (Socket.io).
  * **Frontend:** React + Vite, estilizado com Tailwind CSS e componentes [shadcn/ui](https://ui.shadcn.com/).
  * **Banco de Dados:** PostgreSQL 18 (executado via Docker Compose com volume persistente).
  * **Gerenciador de Pacotes:** `pnpm`.
  * **Ambiente de Execução:** Docker & Docker Compose com montagem de diretórios locais de código do desenvolvedor.

---

## 2. Arquitetura da Aplicação

```
┌────────────────────────────────────────────────────────────────────────┐
│                          DOCKER COMPOSE                                │
│                                                                        │
│  ┌─────────────────────────┐          ┌─────────────────────────────┐  │
│  │   Frontend (React/Vite) │          │       Backend (NestJS)      │  │
│  │      Porta 3000         │◄────────►│          Porta 3333         │  │
│  │  (Tailwind + shadcn/ui) │  REST /  │ (Prisma, WebSockets, Agent) │  │
│  └─────────────────────────┘  WS      └──────────────┬──────────────┘  │
│                                                      │                 │
│                                                      ▼                 │
│                                       ┌─────────────────────────────┐  │
│                                       │   PostgreSQL 18 (Port 5432) │  │
│                                       │  (Cache de Repos & Tarefas) │  │
│                                       └─────────────────────────────┘  │
└──────────────────────────────────────────────────────┬─────────────────┘
                                                       │
                                 Volume Mount          │
                              (Host Filesystem)        ▼
                   ┌─────────────────────────────────────────────────────┐
                   │    Repositórios Locais do Desenvolvedor             │
                   │    (Ex.: /home/user/projects ➔ /workspace/repos)    │
                   └─────────────────────────────────────────────────────┘
```

---

## 3. Estrutura de Diretórios do Projeto

```
agents-platform/
├── docker-compose.yml
├── .env.example
├── pnpm-workspace.yaml
├── package.json
├── apps/
│   ├── api/                     # Backend NestJS
│   │   ├── Dockerfile
│   │   ├── package.json
│   │   ├── prisma/
│   │   │   └── schema.prisma
│   │   └── src/
│   │       ├── modules/
│   │       │   ├── agent/       # Orquestrador do Agente e Runner de Comandos
│   │       │   ├── repository/  # Scanner e Gerenciamento de Repositórios
│   │       │   ├── task/        # Histórico de Tarefas e Status
│   │       │   └── gateway/     # WebSocket Gateway para streaming de logs
│   │       └── main.ts
│   │
│   └── web/                     # Frontend React + Vite
│       ├── Dockerfile
│       ├── package.json
│       ├── tailwind.config.js
│       ├── components.json      # Configuração shadcn/ui
│       └── src/
│           ├── components/
│           │   ├── ui/          # Componentes shadcn/ui (Button, Dialog, Badge, etc.)
│           │   ├── TerminalLog.tsx
│           │   ├── DiagnosticViewer.tsx
│           │   └── RepositoryCard.tsx
│           ├── pages/
│           │   ├── Dashboard.tsx
│           │   ├── TaskExecution.tsx
│           │   └── Repositories.tsx
│           └── App.tsx
```

---

## 4. Configuração do Docker Compose (`docker-compose.yml`)

```yaml
version: '3.8'

services:
  postgres:
    image: postgres:18-alpine
    container_name: agent_postgres
    restart: unless-stopped
    environment:
      POSTGRES_USER: ${POSTGRES_USER:-postgres}
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD:-postgres}
      POSTGRES_DB: ${POSTGRES_DB:-agent_db}
    ports:
      - "5432:5432"
    volumes:
      - postgres_data:/var/lib/postgresql
    networks:
      - agent-network
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U postgres"]
      interval: 5s
      timeout: 5s
      retries: 5

  backend:
    build:
      context: .
      dockerfile: apps/api/Dockerfile
    container_name: agent_api
    restart: unless-stopped
    depends_on:
      postgres:
        condition: service_healthy
    ports:
      - "3333:3333"
    environment:
      NODE_ENV: development
      PORT: 3333
      DATABASE_URL: postgresql://${POSTGRES_USER:-postgres}:${POSTGRES_PASSWORD:-postgres}@postgres:5432/${POSTGRES_DB:-agent_db}?schema=public
      GEMINI_API_KEY: ${GEMINI_API_KEY}
      KANBANIZE_API_KEY: ${KANBANIZE_API_KEY}
      KANBANIZE_SUBDOMAIN: ${KANBANIZE_SUBDOMAIN}
      AZURE_DEVOPS_ORG_URL: ${AZURE_DEVOPS_ORG_URL}
      AZURE_DEVOPS_PROJECT: ${AZURE_DEVOPS_PROJECT}
      REPOS_BASE_DIR: /workspace/repos
    volumes:
      # Montagem dos repositórios da sua máquina para execução direta
      - ${HOST_REPOS_PATH:-../}:/workspace/repos
      # Configurações do Git e Azure CLI do host para manter autenticação
      - ~/.gitconfig:/root/.gitconfig:ro
      - ~/.azure:/root/.azure
    networks:
      - agent-network

  frontend:
    build:
      context: .
      dockerfile: apps/web/Dockerfile
    container_name: agent_web
    restart: unless-stopped
    depends_on:
      - backend
    ports:
      - "3000:3000"
    environment:
      VITE_API_URL: http://localhost:3333
      VITE_WS_URL: ws://localhost:3333
    networks:
      - agent-network

volumes:
  postgres_data:
    driver: local

networks:
  agent-network:
    driver: bridge
```

---

## 5. Módulos do Backend (NestJS)

### 5.1. WebSocket Gateway (`agent.gateway.ts`)
Responsável pela comunicação bidirecional com a UI:
* Envia logs linha a linha via evento `task:log`.
* Notifica evento `task:approval_required` contendo o diagnóstico técnico.
* Escuta evento `task:approval_response` com a decisão do usuário (`approved: true | false`).

### 5.2. Módulo de Scanner e Repositórios (`repository.service.ts`)
* Lê os diretórios presentes em `/workspace/repos`.
* Extrai metadados do `package.json` e estrutura de pastas.
* Valida o hash do último commit (`git rev-parse HEAD`).
* Salva ou recupera os dados via Prisma no PostgreSQL.

### 5.3. Orquestrador da Tarefa (`agent-runner.service.ts`)
* Faz a chamada à API do Kanbanize para buscar dados do card.
* Dispara a LLM (Gemini 2.5 Pro) injetando o contexto do repositório alvo.
* Aguarda a resolução da aprovação (Promise com timeout de segurança).
* Cria a branch Git, escreve o código com `fs-extra`, executa `pnpm run lint --fix` e `pnpm test`.
* Executa push e cria a PR no Azure DevOps utilizando o Azure CLI.

---

## 6. Funcionalidades da Interface Web (React + shadcn/ui)

1. **Dashboard de Repositórios:**
   * Listagem de todos os repositórios detectados em `/workspace/repos`.
   * Cards com badges indicando Framework (NestJS/Fastify), Validação (Zod/class-validator), ORM e Ferramenta de Teste.
   * Indicador visual de **Cache Válido** ou **Necessita Varredura**.
2. **Execução de Tarefas:**
   * Formulário para informar o ID do Card Kanbanize e selecionar o repositório de destino.
   * Botão "Iniciar Análise e Execução".
3. **Painel de Aprovação Human-in-the-Loop:**
   * Modal ou tela dedicada exibindo o diagnóstico arquitetural formatado em Markdown com highlight de sintaxe para os schemas Zod e DTOs gerados.
   * Botões de ação rápida: **"Aprovar Implementação e PR"** e **"Rejeitar Execução"**.
4. **Terminal Interativo de Logs:**
   * Componente de terminal escuro que transmite a saída de comandos (`git`, `pnpm lint`, `pnpm test`) em tempo real.
   * Exibição visual do status do loop de auto-correção (Self-Healing).
5. **Histórico e PRs:**
   * Tabela com tarefas executadas, link direto para a PR no Azure DevOps e tempo de execução.

---

## 7. Passos para Execução Local

### 7.1. Configuração do `.env`
Crie o arquivo `.env` na raiz do projeto:
```bash
POSTGRES_USER=postgres
POSTGRES_PASSWORD=postgres
POSTGRES_DB=agent_db

GEMINI_API_KEY="seu-token-gemini"
KANBANIZE_API_KEY="seu-token-kanbanize"
KANBANIZE_SUBDOMAIN="sua-empresa"
AZURE_DEVOPS_ORG_URL="https://dev.azure.com/SuaOrg"
AZURE_DEVOPS_PROJECT="SeuProjeto"

# Caminho absoluto da pasta onde ficam seus repositórios locais no host
HOST_REPOS_PATH=/home/seu-usuario/projetos
```

### 7.2. Inicialização do Ambiente
```bash
# Instalação das dependências do monorepo via pnpm
pnpm install

# Subir todos os serviços com Docker Compose
docker compose up --build
```

Acesse:
* **Frontend Web:** `http://localhost:3000`
* **API NestJS:** `http://localhost:3333`
* **Documentação Swagger (opcional):** `http://localhost:3333/api`
