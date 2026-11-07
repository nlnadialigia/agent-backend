# Especificação Técnica: Agente de Backend Autônomo com Cache Estrutural de Repositório

Documento de especificação técnica, arquitetura e fluxo de execução do **Agente Autônomo de Backend**, projetado para atuar no ecossistema Node.js / TypeScript (NestJS, Fastify, Express, Clean Architecture).

---

## 1. Visão Geral e Objetivos

* **Foco Exclusivo em Backend:** O agente atua estritamente em serviços, APIs, regras de negócio, persistência (ex.: Prisma, TypeORM), schemas de validação e testes automatizados. Foram removidos quaisquer escopos de frontend ou ingestão de otimizadores externos.
* **Globalidade e Adaptabilidade (Node/TypeScript):** O agente adapta-se dinamicamente às convenções, frameworks e bibliotecas encontradas no repositório de destino através de uma etapa de **Análise Estrutural e Arquitetural**.
* **Cache Persistente de Repositório (PostgreSQL + Prisma):** O mapeamento arquitetural do repositório é gravado no banco de dados local. Em tarefas subsequentes no mesmo repositório, o agente reutiliza o perfil arquitetural salvo, verificando apenas deltas de commit (`HEAD`), eliminando overhead de reanálise.
* **Human-in-the-Loop (Portão de Aprovação):** Geração prévia de blueprint/diagnóstico detalhado para aprovação do desenvolvedor antes de qualquer alteração física ou abertura de Pull Request no Azure DevOps.
* **Auto-Correção com Feedback Loop:** Execução de linters e testes com tentativa autônoma de ajuste de erros caso os testes unitários falhem antes de solicitar intervenção humana.

---

## 2. Fluxo Arquitetural do Agente

```
                          [Entrada: Card ID + Repositório Alvo]
                                          │
                                          ▼
                      ┌───────────────────────────────────────┐
                      │    1. Verificação de Cache Local     │
                      │       (PostgreSQL via Prisma)         │
                      └───────────────────┬───────────────────┘
                                          │
                           Existe perfil válido e atualizado?
                             ├── Sim ──> Carrega Perfil do Banco
                             └── Não ──> Executa Scanner Estrutural
                                              │
                                              ▼
                                 [Scanner do Repositório]
                                 ├── package.json (deps, scripts)
                                 ├── tsconfig, eslint, prettier
                                 ├── Árvore de diretórios (src/)
                                 ├── ORM e migrações (Prisma/etc)
                                 └── Salva/Atualiza Perfil no Banco
                                          │
                                          ▼
                      ┌───────────────────────────────────────┐
                      │    2. Consulta ao Kanbanize           │
                      │  (Obtém título, descrição e tags)    │
                      └───────────────────┬───────────────────┘
                                          │
                                          ▼
                      ┌───────────────────────────────────────┐
                      │    3. Geração de Diagnóstico / Plano │
                      │  (LLM injeta Perfil do Repo + Card)   │
                      │  ├── Entidades e rotas afetadas       │
                      │  ├── Schemas de validação e DTOs      │
                      │  └── Estratégia de testes unitários  │
                      └───────────────────┬───────────────────┘
                                          │
                                          ▼
                      ┌───────────────────────────────────────┐
                      │ 4. Portão de Aprovação (Human-in-loop)│
                      │     (Terminal CLI ou Interface Web)   │
                      └───────────────────┬───────────────────┘
                                          │
                            Aprovado pelo Desenvolvedor?
                                  ├── Não ──> Aborta operação
                                  └── Sim
                                       │
                                       ▼
                      ┌───────────────────────────────────────┐
                      │ 5. Execução e Escrita de Código       │
                      │ ├── Cria branch: feat/card-<ID>       │
                      │ └── Gera controllers, services, tests │
                      └───────────────────┬───────────────────┘
                                          │
                                          ▼
                      ┌───────────────────────────────────────┐
                      │ 6. Validação: Linter + Testes Unitários│
                      │ (pnpm run lint --fix && pnpm test)    │
                      └───────────────────┬───────────────────┘
                                          │
                                Passou nos testes?
                                  ├── Não ──> Loop de Auto-correção (até 2x)
                                  └── Sim
                                       │
                                       ▼
                      ┌───────────────────────────────────────┐
                      │ 7. Git Commit, Push e Azure DevOps PR │
                      │ ├── git commit -m "feat: ..."         │
                      │ ├── git push origin branch            │
                      │ └── az repos pr create                │
                      └───────────────────────────────────────┘
```

---

## 3. Modelo de Dados de Cache Estrutural (Prisma Schema)

O cache dos repositórios e o histórico das tarefas são persistidos no PostgreSQL local:

```prisma
datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

generator client {
  provider = "prisma-client-js"
}

model RepositoryProfile {
  id              String         @id @default(uuid())
  name            String         @unique
  localPath       String
  remoteUrl       String?
  lastAnalyzedAt  DateTime       @default(now())
  lastCommitHash  String
  
  // Metadados técnicos identificados
  framework       String         // ex.: NestJS, Fastify, Express
  languageVersion String         // ex.: Node 20 / TypeScript 5.x
  packageManager  String         // ex.: pnpm
  orm             String?        // ex.: Prisma, TypeORM, Drizzle, Nenhum
  validationLib   String?        // ex.: Zod, Class-Validator, Yup
  testFramework   String?        // ex.: Jest, Vitest
  
  // Estrutura e convenções serializadas em JSON
  directoryLayout Json           // Mapeamento de pastas principais (src/modules, etc.)
  codingStandards Json           // Padrões de exportação, injeção de dependência, etc.
  rawDependencies Json           // Dependências e devDependencies do package.json
  
  tasks           TaskExecution[]
  createdAt       DateTime       @default(now())
  updatedAt       DateTime       @updatedAt
}

model TaskExecution {
  id              String            @id @default(uuid())
  cardId          String
  cardTitle       String
  cardDescription String?
  repositoryId    String
  repository      RepositoryProfile @relation(fields: [repositoryId], references: [id])
  
  status          TaskStatus        @default(PENDING_DIAGNOSTIC)
  diagnosticPlan  String?           @db.Text
  branchName      String?
  pullRequestUrl  String?
  executionLogs   Json?             // Linha do tempo dos logs e comandos
  
  createdAt       DateTime          @default(now())
  updatedAt       DateTime          @updatedAt
}

enum TaskStatus {
  PENDING_DIAGNOSTIC
  WAITING_APPROVAL
  IMPLEMENTING
  RUNNING_TESTS
  SELF_HEALING
  COMPLETED
  FAILED
  REJECTED
}
```

---

## 4. Módulo de Análise e Scanner de Repositório

O scanner inspeciona o repositório local sem depender de chamadas à LLM para extrair fatos determinísticos, minimizando consumo de tokens:

### 4.1. Regras de Extração Automática
1. **`package.json`**:
   - Detecta Framework (`@nestjs/core`, `fastify`, `express`).
   - Detecta Validação (`zod`, `class-validator`, `joi`).
   - Detecta ORM (`@prisma/client`, `typeorm`, `drizzle-orm`).
   - Detecta Ferramenta de Testes (`jest`, `vitest`).
   - Identifica scripts de lint e teste (`pnpm run lint`, `pnpm run test`).
2. **Estrutura de Pastas**:
   - Mapeia diretórios centrais (ex.: `src/modules`, `src/controllers`, `src/services`, `src/domain`, `prisma/schema.prisma`).
3. **Commit Hash**:
   - Lê `git rev-parse HEAD` para comparar com `lastCommitHash`. Se idêntico, o agente pula o re-escaneamento e injeta o perfil existente.

### 4.2. Injeção do Perfil no Prompt do Agente
Quando o agente formula a instrução para o modelo (Gemini), ele anexa o resumo das convenções:

```
[PERFIL DO REPOSITÓRIO: {repo.name}]
- Framework: {repo.framework}
- Validação: {repo.validationLib} (Siga rigorosamente as convenções desta biblioteca)
- ORM: {repo.orm}
- Testes: {repo.testFramework} (Gere specs conforme o padrão existente do projeto)
- Gerenciador de Pacotes: {repo.packageManager} (Utilize comandos pnpm)
- Padrão de Diretórios: {repo.directoryLayout}
```

---

## 5. Sugestões de Melhorias Implementadas nesta Especificação

1. **Auto-Correção com Loop de Feedback de Testes (Self-Healing Loop):**
   - Se o comando de testes falhar (`pnpm test`), a saída de erro (stderr/stdout) é capturada e reenviada à LLM junto com o código gerado em uma rodada de correção autônoma (limite de até 2 iterações).
2. **Modularização de Ferramentas (Tool Calling Nativo):**
   - Substituição de scripts rígidos por ferramentas modulares: `read_repo_file`, `list_repo_dir`, `write_repo_file`, `run_git_command`, `run_test_command`.
3. **Validação de Formatação Automática:**
   - Execução de `pnpm lint --fix` ou `pnpm prettier --write` antes dos testes e commits, eliminando erros triviais de formatação no PR.
4. **Desacoplamento do Portão de Aprovação:**
   - O processo de aprovação suporta tanto polling/webhook para a interface web quanto prompt interativo de terminal CLI.
5. **Controle Estrito de Branches e Git Hygiene:**
   - Verificação prévia de que o repositório está limpo (`git status --porcelain`) antes de iniciar a branch `feat/card-<ID>`, garantindo isolamento da base de código.

---

## 6. Código de Referência do Agente Backend (`agent_backend.py` / `agent.ts`)

Abaixo está a arquitetura de implementação do núcleo do agente em TypeScript/Node (alinhado com o backend NestJS da aplicação orquestradora):

```typescript
import { GoogleGenAI } from '@google/genai';
import { PrismaClient } from '@prisma/client';
import { execa } from 'execa';
import * as fs from 'fs-extra';
import * as path from 'path';

export class BackendAutonomousAgent {
  private prisma: PrismaClient;
  private ai: GoogleGenAI;

  constructor() {
    this.prisma = new PrismaClient();
    this.ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  }

  /**
   * 1. Analisa ou recupera do cache o perfil estrutural do repositório
   */
  async getOrUpdateRepositoryProfile(repoPath: string, repoName: string) {
    const { stdout: currentCommit } = await execa('git', ['rev-parse', 'HEAD'], { cwd: repoPath });

    const cachedProfile = await this.prisma.repositoryProfile.findUnique({
      where: { name: repoName }
    });

    if (cachedProfile && cachedProfile.lastCommitHash === currentCommit) {
      console.log(`⚡ [Cache Hit] Perfil do repositório ${repoName} reutilizado do banco.`);
      return cachedProfile;
    }

    console.log(`🔍 [Scanner] Mapeando estrutura do repositório ${repoName}...`);
    const packageJsonPath = path.join(repoPath, 'package.json');
    const pkg = await fs.readJson(packageJsonPath);

    const deps = { ...pkg.dependencies, ...pkg.devDependencies };

    const framework = deps['@nestjs/core'] ? 'NestJS' : deps['fastify'] ? 'Fastify' : 'Express';
    const validationLib = deps['zod'] ? 'Zod' : deps['class-validator'] ? 'class-validator' : 'Nenhuma/Custom';
    const orm = deps['@prisma/client'] ? 'Prisma' : deps['typeorm'] ? 'TypeORM' : deps['drizzle-orm'] ? 'Drizzle' : 'Outro';
    const testFramework = deps['vitest'] ? 'Vitest' : 'Jest';

    const directoryLayout = {
      hasModules: await fs.pathExists(path.join(repoPath, 'src/modules')),
      hasControllers: await fs.pathExists(path.join(repoPath, 'src/controllers')),
      hasPrismaSchema: await fs.pathExists(path.join(repoPath, 'prisma/schema.prisma')),
    };

    return await this.prisma.repositoryProfile.upsert({
      where: { name: repoName },
      create: {
        name: repoName,
        localPath: repoPath,
        lastCommitHash: currentCommit,
        framework,
        languageVersion: 'TypeScript',
        packageManager: 'pnpm',
        orm,
        validationLib,
        testFramework,
        directoryLayout,
        codingStandards: {},
        rawDependencies: deps,
      },
      update: {
        lastCommitHash: currentCommit,
        lastAnalyzedAt: new Date(),
        framework,
        orm,
        validationLib,
        directoryLayout,
        rawDependencies: deps,
      }
    });
  }

  /**
   * 2. Loop de execução principal com portão de aprovação e auto-correção
   */
  async executeTask(params: {
    cardId: string;
    cardTitle: string;
    cardDescription: string;
    repoPath: string;
    repoName: string;
    onApprovalRequested: (diagnostic: string) => Promise<boolean>;
    onLog: (message: string) => void;
  }) {
    const profile = await this.getOrUpdateRepositoryProfile(params.repoPath, params.repoName);
    
    // Geração de Diagnóstico
    const systemInstruction = `
      Você é um Engenheiro de Software Sênior especialista em Backend (${profile.framework}, TypeScript, ${profile.orm || 'ORM'}).
      Regras de implementação:
      1. Utilize exclusivamente a biblioteca de validação ${profile.validationLib}.
      2. Mantenha a arquitetura de pastas existente: ${JSON.stringify(profile.directoryLayout)}.
      3. Crie ou atualize testes unitários utilizando ${profile.testFramework}.
      4. O gerenciador de pacotes do projeto é ${profile.packageManager}.
    `;

    const diagnostic = await this.generateDiagnostic(params, systemInstruction, profile);

    // Human-in-the-Loop
    const approved = await params.onApprovalRequested(diagnostic);
    if (!approved) {
      params.onLog('❌ Execução rejeitada pelo desenvolvedor.');
      return;
    }

    // Branch e Criação de Arquivos
    const branchName = `feat/card-${params.cardId}`;
    await execa('git', ['checkout', '-b', branchName], { cwd: params.repoPath });

    await this.applyCodeChanges(params, diagnostic, systemInstruction);

    // Validação de Linter e Testes com Loop de Correção
    const testPassed = await this.validateWithSelfHealing(params.repoPath, systemInstruction, 2);
    if (!testPassed) {
      throw new Error('Falha nos testes após tentativas de auto-correção.');
    }

    // Git Commit, Push e Azure DevOps PR
    await execa('git', ['add', '.'], { cwd: params.repoPath });
    await execa('git', ['commit', '-m', `feat: ${params.cardTitle} (Card #${params.cardId})`], { cwd: params.repoPath });
    await execa('git', ['push', '-u', 'origin', branchName], { cwd: params.repoPath });

    await execa('az', [
      'repos', 'pr', 'create',
      '--source-branch', branchName,
      '--title', `feat: ${params.cardTitle}`,
      '--description', diagnostic,
      '--open'
    ], { cwd: params.repoPath });

    params.onLog('🚀 Pull Request aberto com sucesso no Azure DevOps!');
  }

  private async generateDiagnostic(params: any, systemInstruction: string, profile: any): Promise<string> {
    const response = await this.ai.models.generateContent({
      model: 'gemini-2.5-pro',
      contents: `
        Analise o card #${params.cardId}:
        Título: ${params.cardTitle}
        Descrição: ${params.cardDescription}

        Gere um diagnóstico arquitetural contendo:
        1. Escopo de entidades, models e regras de negócio de backend.
        2. DTOs e Schemas com ${profile.validationLib}.
        3. Camadas e arquivos a serem criados/alterados.
        4. Estratégia de testes com ${profile.testFramework}.
      `,
      config: { systemInstruction, temperature: 0.2 }
    });
    return response.text || '';
  }

  private async applyCodeChanges(params: any, diagnostic: string, systemInstruction: string) {
    // Implementação da escrita de arquivos usando as tools de File System no diretório params.repoPath
  }

  private async validateWithSelfHealing(repoPath: string, systemInstruction: string, maxRetries: number): Promise<boolean> {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        await execa('pnpm', ['run', 'lint', '--fix'], { cwd: repoPath });
        await execa('pnpm', ['test'], { cwd: repoPath });
        return true;
      } catch (err: any) {
        console.warn(`⚠️ Tentativa ${attempt} falhou nos testes:\n${err.message}`);
        if (attempt === maxRetries) return false;
        // Reenvia erro para o LLM ajustar os arquivos correspondentes
      }
    }
    return false;
  }
}
```

---

## 7. Próximos Passos
1. Configuração das credenciais no arquivo `.env` compartilhado.
2. Integração com a aplicação web NestJS + React via Docker Compose.
3. Teste de mapeamento com o repositório local montado.
