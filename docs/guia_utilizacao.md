# Guia Completo de Utilização da Plataforma

Este guia detalha o funcionamento de cada componente da interface web, como conectar seus repositórios reais da máquina, como disparar tarefas do Kanbanize e como funciona o fluxo de aprovação humana (Human-in-the-Loop).

---

## 1. Visão Geral da Interface (`http://localhost:3000`)

A interface web foi desenvolvida para operar localmente via Docker Compose e é dividida em 3 seções principais acessadas pelas abas superiores:

1. **Executar Tarefa:** Onde você insere o ID do card, escolhe o projeto, acompanha os logs em tempo real e aprova as implementações.
2. **Repositórios:** Mostra todos os projetos encontrados no seu computador, o status do cache e o resultado da análise arquitetural (framework, biblioteca de validação, ORM, etc.).
3. **Histórico:** Tabela com todas as tarefas já executadas e links diretos para os Pull Requests criados.

---

## 2. O que Significa a Badge "API Conectada"?

No canto superior direito da tela há um indicador de status:

* 🟢 **API Conectada:** Significa que o Frontend (React/Vite) está com uma conexão WebSocket bidirecional ativa com o Backend (NestJS na porta 3333). Isso garante que os logs do terminal e a solicitação de aprovação sejam transmitidos instantaneamente para a sua tela sem necessidade de recarregar a página.
* 🔴 **Desconectado:** Indica que a API NestJS está fora do ar, reiniciando ou que o contêiner `agent_backend_api` ainda não concluiu a inicialização.

---

## 3. Como os Repositórios Aparecem (Não são Mockados!)

### De onde veio o repositório `sample-backend-service`?
Ele **não é um mock fixo no código**. Durante os testes automatizados da plataforma, criamos um projeto Node/TypeScript real em `/home/nlnadialigia/projects/sample-backend-service`. O scanner do agente leu o diretório físico, inspecionou o `package.json`, identificou NestJS + Zod + Prisma + Jest e gravou esse perfil no PostgreSQL 18.

### Como conectar seus projetos reais de trabalho:
A plataforma descobre os repositórios através de uma variável no arquivo `.env`:

```bash
# Caminho absoluto da pasta onde ficam os seus projetos no host (seu computador)
HOST_REPOS_PATH="/home/nlnadialigia/projects"
```

1. **Abra o arquivo `.env`** na raiz de `agent-backend`:
   * Se os seus repositórios reais ficam em outra pasta (ex.: `/home/nlnadialigia/repos` ou `/home/nlnadialigia/workspace`), basta alterar o valor de `HOST_REPOS_PATH` para essa pasta.
2. **Como o Docker enxerga seus projetos:**
   * O Docker Compose monta o caminho de `HOST_REPOS_PATH` dentro do contêiner em `/workspace/repos`.
   * Qualquer subpasta dentro desse diretório que contenha um arquivo `package.json` e um repositório Git será automaticamente identificada e exibida na aba **"Repositórios"**.
3. **Botão "Scan" no Card do Repositório:**
   * Ao clicar em "Scan", o agente lê o `package.json`, os diretórios (`src/modules`, etc.) e o hash do último commit Git (`git rev-parse HEAD`).
   * Essas informações são salvas em cache no banco local para que as próximas execuções sejam instantâneas.

---

## 4. Como as Tarefas Funcionam e como Executá-las

Atualmente, o fluxo de execução é **sob demanda** (você informa qual card quer que o agente resolva):

### Passo a Passo:

1. **No Kanbanize:**
   * Pegue o número (ID) do card que você precisa implementar (exemplo: `1024`).
2. **Na Interface Web:**
   * Acesse a aba **"Executar Tarefa"**.
   * No campo **"Card ID (Kanbanize)"**, digite o ID: `1024`.
   * No dropdown **"Repositório Vinculado"**, selecione em qual projeto o agente deve trabalhar.
   * Clique no botão **"Iniciar Execução"**.

### O que o Agente faz nos Bastidores:

```
[1. Busca no Kanbanize] ──► Obtém título, descrição e critérios de aceite
          │
[2. Consulta Cache]     ──► Carrega o padrão do projeto (ex.: NestJS + Zod + Jest)
          │
[3. Raciocínio com IA]  ──► Elabora o Diagnóstico Arquitetural e DTOs
          │
[4. Human-in-the-Loop]  ──► Exibe o plano na tela e aguarda sua decisão
```

> **Nota sobre credenciais:** Se as variáveis `KANBANIZE_API_KEY` ou `GEMINI_API_KEY` não estiverem preenchidas no `.env`, o agente ativa automaticamente o modo de simulação/desenvolvimento para permitir que você teste a interface sem erros de conexão.

---

## 5. O Portão de Aprovação (Human-in-the-Loop)

Assim que o agente formula a estratégia, o fluxo **pausa a execução física** e exibe um painel de aprovação destacado em azul na sua tela:

* **Visualizador de Diagnóstico:** Você lê a análise de escopo, os schemas Zod desenhados, a lista de controllers/services que serão criados e a estratégia de testes unitários.
* **Seus Controles:**
  * 🟢 **Aprovar Implementação & PR:** O agente retoma o trabalho, cria uma branch Git isolada (`feat/card-<ID>`), gera o código nos arquivos físicos do seu computador, roda `pnpm run lint --fix`, roda os testes unitários (`pnpm test`), faz o commit e abre a Pull Request.
  * 🔴 **Rejeitar / Cancelar:** O agente aborta o processo imediatamente sem tocar em nenhum arquivo do seu repositório.

---

## 6. Acompanhamento pelo Terminal em Tempo Real

Na parte inferior da tela, o componente **Terminal do Agente** transmite linha por linha os passos e comandos executados:
* 🟢 **Verde:** Sucessos (ex.: card encontrado, testes unitários passaram, branch criada).
* 🟡 **Amarelo:** Avisos ou execução do loop de auto-correção (Self-Healing).
* 🔵 **Azul / Branco:** Comandos de terminal e etapas em andamento.
* 🔴 **Vermelho:** Falhas de execução ou cancelamentos.

---

## 7. Resumo das Variáveis do `.env`

Para que o ciclo completo funcione com seus dados reais de produção/empresa, preencha as seguintes chaves no seu `.env`:

```bash
# Pasta onde estão os seus projetos no seu computador
HOST_REPOS_PATH=/home/nlnadialigia/projects

# Motor IA
GEMINI_API_KEY="sua-chave-do-google-ai-studio"

# Gestão de Tarefas
KANBANIZE_API_KEY="seu-token-v2"
KANBANIZE_SUBDOMAIN="sua-empresa"

# Controle de Código e Pull Requests
AZURE_DEVOPS_PAT="seu-personal-access-token"
AZURE_DEVOPS_ORG_URL="https://dev.azure.com/SuaOrg"
AZURE_DEVOPS_PROJECT="SeuProjeto"
```
