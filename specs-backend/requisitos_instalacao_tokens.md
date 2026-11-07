# Guia de Instalações, Credenciais e Tokens do Agente de Backend

Este documento lista todos os pré-requisitos de sistema, ferramentas locais, contas de serviços externos, permissões de tokens e variáveis de ambiente necessários para a execução e orquestração do **Agente Autônomo de Backend**.

---

## 1. Ferramentas e Instalações no Sistema Operacional (Host)

Para que a aplicação local e o agente possam interagir com os seus repositórios e serviços de contêineres, as seguintes ferramentas devem estar instaladas na sua máquina de desenvolvimento:

| Ferramenta | Versão Recomendada | Finalidade no Projeto | Comando de Verificação |
| :--- | :--- | :--- | :--- |
| **Node.js** | `>= 20.x LTS` | Runtime da aplicação NestJS e scripts de automação | `node -v` |
| **pnpm** | `>= 9.x` | Gerenciador de pacotes obrigatório do monorepo | `pnpm -v` |
| **Docker** | `>= 24.x` | Engine para execução dos contêineres locais | `docker -v` |
| **Docker Compose** | `>= 2.20+` (Compose v2) | Orquestração dos serviços (Postgres, NestJS, React) | `docker compose version` |
| **Git** | `>= 2.34+` | Controle de versão, criação de branches e commits | `git --version` |
| **Azure CLI (`az`)** | `>= 2.50+` | Interação via CLI com os repositórios e PRs do Azure DevOps | `az --version` |

### 1.1. Instalação do `pnpm`
Caso ainda não possua o `pnpm` instalado:
```bash
corepack enable
corepack prepare pnpm@latest --activate
# Ou via npm global:
npm install -g pnpm
```

### 1.2. Instalação e Configuração da Extensão Azure DevOps
O Azure CLI precisa da extensão oficial para gerenciar Pull Requests e Repositórios:
```bash
az extension add --name azure-devops
```

---

## 2. Contas, Chaves de API e Tokens Necessários

O agente integra com 3 serviços externos principais além do banco de dados local:

```
┌────────────────────────────────────────────────────────────────────────┐
│                        MAPA DE TOKENS E ACESSOS                        │
│                                                                        │
│  1. Google Gemini API   ──► Geração de blueprints, código e diagnóstico│
│  2. Kanbanize API Token ──► Leitura de cards, critérios de aceite      │
│  3. Azure DevOps PAT    ──► Criação de branches remotas e Pull Requests│
│  4. PostgreSQL Local    ──► Cache de perfil estrutural dos repositórios│
└────────────────────────────────────────────────────────────────────────┘
```

---

## 3. Passo a Passo para Obtenção de Cada Credencial

### 3.1. Google Gemini API Key
* **Finalidade:** Motor de raciocínio da LLM para análise arquitetural, geração de código e auto-correção de testes.
* **Onde obter:**
  1. Acesse o [Google AI Studio](https://aistudio.google.com/).
  2. Faça login com a sua conta Google (ou corporativa habilitada).
  3. No menu lateral, clique em **"Get API key"**.
  4. Clique em **"Create API key"** (selecionando um projeto Google Cloud se necessário).
  5. Copie a chave gerada.
* **Variável correspondente:** `GEMINI_API_KEY`.

---

### 3.2. Kanbanize API Key e Subdomínio
* **Finalidade:** Consulta automática do título, descrição, tags e critérios de aceite das tarefas.
* **Onde obter:**
  1. Acesse o Kanbanize da sua organização (`https://<sua-empresa>.kanbanize.com`).
  2. No canto superior direito, clique na sua **foto de perfil** e acesse **"My Account"** (Minha Conta).
  3. Vá até a aba **"API"** ou **"API Credentials"**.
  4. Gere ou copie o seu **API Key** (token v2).
  5. O subdomínio corresponde à primeira parte da URL da sua empresa (ex.: se for `https://acme.kanbanize.com`, o subdomínio é `acme`).
* **Variáveis correspondentes:**
  * `KANBANIZE_API_KEY`: Token gerado.
  * `KANBANIZE_SUBDOMAIN`: Subdomínio da organização.

---

### 3.3. Azure DevOps Personal Access Token (PAT)
* **Finalidade:** Autenticar o Azure CLI para enviar branches via git e criar Pull Requests automaticamente (`az repos pr create`).
* **Onde obter:**
  1. Acesse a organização do Azure DevOps: `https://dev.azure.com/<SuaOrganizacao>`.
  2. No canto superior direito, clique no ícone de configurações de usuário (ao lado da foto) e selecione **"Personal Access Tokens"**.
  3. Clique em **"+ New Token"**.
  4. Defina:
     * **Name:** `Agent-CLI-Local`
     * **Expiration:** Escolha a validade desejada (ex.: 90 ou 180 dias).
     * **Scopes (Permissões mínimas obrigatórias):**
       * `Code`: **Read & Write** (para clonar, inspecionar e commitar).
       * `Code (Status)`: **Read & Write**.
       * `Pull Request Threads`: **Read & Write**.
  5. Clique em **"Create"** e **copie o token imediatamente** (ele não será exibido novamente).
* **Login inicial no Azure CLI:**
  Execute no seu terminal host para validar o login:
  ```bash
  echo "<SEU_PAT_AQUI>" | az devops login --organization https://dev.azure.com/<SuaOrganizacao>
  az devops configure --defaults organization=https://dev.azure.com/<SuaOrganizacao> project=<SeuProjeto>
  ```
* **Variáveis correspondentes:**
  * `AZURE_DEVOPS_PAT`: Token PAT gerado.
  * `AZURE_DEVOPS_ORG_URL`: Ex.: `https://dev.azure.com/SuaOrganizacao`.
  * `AZURE_DEVOPS_PROJECT`: Nome do Projeto no Azure DevOps.

---

### 3.4. Diretório dos Repositórios no Host (`HOST_REPOS_PATH`)
* **Finalidade:** O Docker Compose monta esta pasta dentro do contêiner para que o agente tenha acesso de leitura e escrita aos seus repositórios reais.
* **Configuração:** O caminho absoluto no seu disco local onde ficam os projetos que o agente deve operar (ex.: `/home/nlnadialigia/projects` ou `/home/nlnadialigia/repos`).
* **Variável correspondente:** `HOST_REPOS_PATH`.

---

## 4. Arquivo Modelo de Configuração (`.env`)

Crie o arquivo `.env` na raiz do projeto com a seguinte estrutura:

```bash
# ==============================================================================
# CONFIGURAÇÕES DO BANCO DE DADOS LOCAL (POSTGRESQL VIA DOCKER COMPOSE)
# ==============================================================================
POSTGRES_USER=postgres
POSTGRES_PASSWORD=postgres
POSTGRES_DB=agent_backend_db
POSTGRES_PORT=5432
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/agent_backend_db?schema=public

# ==============================================================================
# INTELIGÊNCIA ARTIFICIAL (GOOGLE GEMINI)
# ==============================================================================
GEMINI_API_KEY="AIzaSy..."

# ==============================================================================
# GESTÃO DE TAREFAS (KANBANIZE)
# ==============================================================================
KANBANIZE_API_KEY="seu-token-v2-kanbanize"
KANBANIZE_SUBDOMAIN="sua-empresa"

# ==============================================================================
# CONTROLE DE CÓDIGO E PULL REQUESTS (AZURE DEVOPS)
# ==============================================================================
AZURE_DEVOPS_PAT="seu-personal-access-token"
AZURE_DEVOPS_ORG_URL="https://dev.azure.com/SuaOrganizacao"
AZURE_DEVOPS_PROJECT="NomeDoProjeto"

# ==============================================================================
# CAMINHO DOS REPOSITÓRIOS LOCAIS NO HOST (Sua máquina)
# ==============================================================================
HOST_REPOS_PATH="/home/nlnadialigia/projects"

# ==============================================================================
# SERVIÇOS WEB LOCAIS
# ==============================================================================
BACKEND_PORT=3333
FRONTEND_PORT=3000
```

---

## 5. Script de Teste e Validação das Credenciais

Após preencher o seu arquivo `.env`, você poderá executar os seguintes comandos rápidos para verificar se todas as conexões estão respondendo com sucesso:

### 5.1. Testar Kanbanize API
```bash
curl -s -X GET "https://${KANBANIZE_SUBDOMAIN}.kanbanize.com/api/v2/me" \
  -H "apikey: ${KANBANIZE_API_KEY}" | jq .
```
*(Deve retornar os dados do seu usuário logado no Kanbanize).*

### 5.2. Testar Gemini API
```bash
curl -s -X POST "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-pro:generateContent?key=${GEMINI_API_KEY}" \
  -H 'Content-Type: application/json' \
  -d '{"contents":[{"parts":[{"text":"ping"}]}]}' | jq .
```
*(Deve retornar resposta com o texto gerado).*

### 5.3. Testar Azure DevOps CLI
```bash
az repos list --query "[].{name:name, id:id}" -o table
```
*(Deve listar os repositórios disponíveis no seu projeto do Azure DevOps).*
