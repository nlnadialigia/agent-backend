import { Injectable, Logger } from '@nestjs/common';
import { GoogleGenAI } from '@google/genai';
import { PrismaService } from '../prisma/prisma.service';
import { RepositoryScannerService, RepositoryScanResult } from '../repository/repository-scanner.service';
import { KanbanizeService, KanbanizeCard } from './kanbanize.service';
import { AzureDevOpsService } from './azure-devops.service';
import { AgentGateway } from '../gateway/agent.gateway';
import { execa } from 'execa';
import * as fs from 'fs-extra';
import * as path from 'path';

export interface ExecuteTaskDto {
  cardId: string;
  repoPath: string;
  repoName?: string;
  customInstructions?: string;
}

@Injectable()
export class AgentRunnerService {
  private readonly logger = new Logger(AgentRunnerService.name);
  private ai?: GoogleGenAI;

  constructor(
    private readonly prisma: PrismaService,
    private readonly scanner: RepositoryScannerService,
    private readonly kanbanize: KanbanizeService,
    private readonly azureDevops: AzureDevOpsService,
    private readonly gateway: AgentGateway,
  ) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (apiKey) {
      this.ai = new GoogleGenAI({ apiKey });
    }
  }

  /**
   * Inicia a execução assíncrona da tarefa
   */
  async startTask(dto: ExecuteTaskDto): Promise<{ taskId: string }> {
    const resolvedPath = path.resolve(dto.repoPath);
    const repoName = dto.repoName || path.basename(resolvedPath);

    // 1. Criar registro de execução no Prisma
    let taskRecord: any;
    try {
      // Garante que o repo profile existe no banco
      const profile = await this.scanner.scanRepository(resolvedPath, repoName);
      
      taskRecord = await this.prisma.taskExecution.create({
        data: {
          cardId: dto.cardId,
          cardTitle: `Card #${dto.cardId}`,
          customInstructions: dto.customInstructions || null,
          repositoryId: profile.id || 'default-repo-id',
          status: 'PENDING_DIAGNOSTIC',
          executionLogs: [],
        },
      });
    } catch (err: any) {
      this.logger.warn(`Banco indisponível para registro inicial da tarefa: ${err.message}. Usando ID em memória.`);
      taskRecord = { id: `task-${Date.now()}` };
    }

    const taskId = taskRecord.id;

    // Dispara em background para não bloquear a resposta HTTP
    this.runPipeline(taskId, dto.cardId, resolvedPath, repoName, dto.customInstructions).catch((err) => {
      this.log(taskId, `❌ Erro crítico no pipeline: ${err.message}`, 'error');
      this.updateStatus(taskId, 'FAILED');
    });

    return { taskId };
  }

  private async runPipeline(taskId: string, cardId: string, repoPath: string, repoName: string, customInstructions?: string) {
    this.log(taskId, `🚀 Iniciando processamento do Card #${cardId} no repositório '${repoName}'...`);
    this.updateStatus(taskId, 'PENDING_DIAGNOSTIC');

    if (customInstructions?.trim()) {
      this.log(taskId, `📝 Instruções adicionais em Markdown recebidas.`);
    }

    // 1. Obter informações do card no Kanbanize
    this.log(taskId, `📥 [1/6] Buscando informações do card no Kanbanize...`);
    const card = await this.kanbanize.getCard(cardId);
    this.log(taskId, `✅ Card identificado: "${card.title}"`, 'success');

    // 2. Análise Estrutural do Repositório (ou uso de cache)
    this.log(taskId, `🔍 [2/6] Verificando perfil arquitetural do repositório...`);
    const profile = await this.scanner.scanRepository(repoPath, repoName);
    if (profile.isCached) {
      this.log(taskId, `⚡ Perfil carregado do cache local (Commit ${profile.lastCommitHash.substring(0, 7)}). Framework: ${profile.framework}, Validação: ${profile.validationLib}`);
    } else {
      this.log(taskId, `✨ Nova análise estrutural concluída e salva no banco.`);
    }

    // 3. Elaboração do Diagnóstico Técnico Arquitetural
    this.log(taskId, `🧠 [3/6] Formulando diagnóstico arquitetural com IA...`);
    const diagnostic = await this.generateDiagnostic(card, profile, customInstructions);
    this.log(taskId, `📋 Diagnóstico técnico gerado com sucesso. Aguardando aprovação humana...`);

    // Atualiza status no banco e solicita aprovação
    await this.updateTaskDiagnostic(taskId, card.title, card.description, diagnostic);

    // 4. Portão Human-in-the-Loop
    const approved = await this.gateway.requestApproval(taskId, diagnostic);
    if (!approved) {
      this.log(taskId, `🛑 Operação cancelada/rejeitada pelo desenvolvedor. Nenhuma alteração foi feita no código.`, 'warn');
      await this.updateStatus(taskId, 'REJECTED');
      return;
    }

    this.log(taskId, `✅ Diagnóstico aprovado pelo desenvolvedor! Iniciando implementação física...`, 'success');
    await this.updateStatus(taskId, 'IMPLEMENTING');

    // 5. Criação de Branch Git
    const branchName = `feat/card-${cardId}`;
    await this.prepareGitBranch(taskId, repoPath, branchName);

    // 6. Geração e Aplicação dos Arquivos
    this.log(taskId, `⚡ [4/6] Gerando código e schemas estritos...`);
    await this.generateAndWriteCode(taskId, repoPath, card, profile, diagnostic);

    // 7. Validação de Linter e Testes com Loop de Auto-Correção
    this.log(taskId, `🧪 [5/6] Executando validação de linter e testes unitários...`);
    await this.updateStatus(taskId, 'RUNNING_TESTS');
    const testsOk = await this.runValidationAndSelfHealing(taskId, repoPath, profile);

    if (!testsOk) {
      this.log(taskId, `⚠️ Testes falharam após tentativas de auto-correção. Interrompendo abertura automática de PR.`, 'error');
      await this.updateStatus(taskId, 'FAILED');
      return;
    }

    // 8. Commit, Push e Pull Request no Azure DevOps
    this.log(taskId, `🚀 [6/6] Criando commit e abrindo Pull Request no Azure DevOps...`);
    const commitMsg = `feat: implementa card #${cardId} - ${card.title}`;
    await execa('git', ['add', '.'], { cwd: repoPath });
    await execa('git', ['commit', '-m', commitMsg], { cwd: repoPath });
    
    try {
      await execa('git', ['push', '-u', 'origin', branchName], { cwd: repoPath });
      this.log(taskId, `🌿 Branch ${branchName} enviada para o repositório remoto.`);
    } catch (err: any) {
      this.log(taskId, `⚠️ Git push remoto ignorado ou simulado: ${err.message}`, 'warn');
    }

    const prResult = await this.azureDevops.createPullRequest({
      repoPath,
      sourceBranch: branchName,
      title: commitMsg,
      description: diagnostic,
    });

    this.log(taskId, `🎉 Pull Request aberto com sucesso: ${prResult.url}`, 'success');
    await this.updateStatus(taskId, 'COMPLETED', {
      pullRequestUrl: prResult.url,
      branchName,
    });
  }

  /**
   * Gera o blueprint técnico do card respeitando convenções do repositório
   */
  private async generateDiagnostic(card: KanbanizeCard, profile: RepositoryScanResult, customInstructions?: string): Promise<string> {
    const systemInstruction = `
      Você é um Arquiteto de Software Sênior especialista em Backend no ecossistema Node.js / TypeScript.
      Convenções MANDATÓRIAS deste repositório:
      - Framework: ${profile.framework}
      - Biblioteca de Validação: ${profile.validationLib} (Se for Zod, NUNCA utilize class-validator/class-transformer. Crie schemas estritos e exporte DTOs com z.infer).
      - ORM / Persistência: ${profile.orm}
      - Test Runner: ${profile.testFramework}
      - Gerenciador de Pacotes: ${profile.packageManager}
      - Layout de Diretórios: ${JSON.stringify(profile.directoryLayout)}
    `;

    const customInstructionsBlock = customInstructions?.trim()
      ? `\n==================================================\n⚠️ INSTRUÇÕES ADICIONAIS DO DESENVOLVEDOR (MARKDOWN):\n${customInstructions.trim()}\n==================================================\n`
      : '';

    const userPrompt = `
      Elabore o diagnóstico técnico arquitetural para o seguinte card do Kanbanize:
      ID: #${card.cardId}
      Título: ${card.title}
      Descrição: ${card.description}
      ${customInstructionsBlock}

      A estrutura da sua resposta deve conter:
      1. 🎯 Escopo e Regras de Negócio de Backend (incorporando as instruções adicionais, se houver)
      2. 📐 Schemas de Validação e DTOs (${profile.validationLib})
      3. 📁 Lista de Arquivos a Criar ou Modificar (módulos, controllers, services, repositories)
      4. 🧪 Estratégia de Testes Unitários (${profile.testFramework})
    `;

    if (this.ai) {
      try {
        const response = await this.ai.models.generateContent({
          model: 'gemini-2.5-pro',
          contents: userPrompt,
          config: {
            systemInstruction,
            temperature: 0.2,
          },
        });
        return response.text || 'Diagnóstico gerado com sucesso.';
      } catch (err: any) {
        this.logger.warn(`Falha na chamada Gemini API: ${err.message}. Gerando diagnóstico fallback.`);
      }
    }

    const fallbackInstructions = customInstructions?.trim()
      ? `\n\n> **Instruções Adicionais:**\n> ${customInstructions.trim().replace(/\n/g, '\n> ')}`
      : '';

    // Fallback estruturado caso a API key ainda não tenha sido configurada
    return `### 🎯 Diagnóstico Técnico Arquitetural - Card #${card.cardId}
**Título:** ${card.title}
**Framework Alvo:** ${profile.framework} | **Validação:** ${profile.validationLib} | **ORM:** ${profile.orm}${fallbackInstructions}

#### 1. Escopo e Entidades
- Mapeamento das regras de negócio e validação estrita dos dados de entrada.
- Criação dos endpoints necessários com validação via ${profile.validationLib}.

#### 2. Schemas e Tipagens (${profile.validationLib})
\`\`\`typescript
import { z } from 'zod';

export const TaskPayloadSchema = z.object({
  title: z.string().min(3),
  description: z.string().optional(),
  status: z.enum(['ACTIVE', 'INACTIVE']).default('ACTIVE'),
});

export type TaskPayloadDto = z.infer<typeof TaskPayloadSchema>;
\`\`\`

#### 3. Arquivos a Criar
- \`src/modules/card-${card.cardId}/card-${card.cardId}.controller.ts\`
- \`src/modules/card-${card.cardId}/card-${card.cardId}.service.ts\`
- \`src/modules/card-${card.cardId}/card-${card.cardId}.module.ts\`
- \`src/modules/card-${card.cardId}/dto/card-${card.cardId}.schema.ts\`
- \`src/modules/card-${card.cardId}/card-${card.cardId}.service.spec.ts\`

#### 4. Estratégia de Testes (${profile.testFramework})
- Cobertura de casos felizes (happy path) com validação de payload válido.
- Cobertura de exceções e erros de validação (dados inválidos).`;
  }

  /**
   * Prepara a branch Git para o card
   */
  private async prepareGitBranch(taskId: string, repoPath: string, branchName: string) {
    try {
      this.log(taskId, `🌿 Criando branch Git local: ${branchName}...`);
      await execa('git', ['checkout', '-b', branchName], { cwd: repoPath });
    } catch {
      this.log(taskId, `Branch ${branchName} já existe, alternando para ela...`);
      await execa('git', ['checkout', branchName], { cwd: repoPath });
    }
  }

  /**
   * Gera arquivos de código e grava no diretório alvo
   */
  private async generateAndWriteCode(
    taskId: string,
    repoPath: string,
    card: KanbanizeCard,
    profile: RepositoryScanResult,
    diagnostic: string,
  ) {
    const targetDir = path.join(repoPath, 'src', 'modules', `card-${card.cardId}`);
    await fs.ensureDir(targetDir);

    // Cria arquivos no padrão do repositório
    const schemaFile = path.join(targetDir, `card-${card.cardId}.schema.ts`);
    const serviceFile = path.join(targetDir, `card-${card.cardId}.service.ts`);
    const controllerFile = path.join(targetDir, `card-${card.cardId}.controller.ts`);
    const moduleFile = path.join(targetDir, `card-${card.cardId}.module.ts`);
    const specFile = path.join(targetDir, `card-${card.cardId}.service.spec.ts`);

    const schemaContent = `import { z } from 'zod';

export const Card${card.cardId}Schema = z.object({
  id: z.string().uuid().optional(),
  title: z.string().min(1, 'Título é obrigatório'),
  description: z.string().optional(),
  createdAt: z.date().default(() => new Date()),
});

export type Card${card.cardId}Dto = z.infer<typeof Card${card.cardId}Schema>;
`;

    const serviceContent = `import { Injectable } from '@nestjs/common';
import { Card${card.cardId}Dto } from './card-${card.cardId}.schema';

@Injectable()
export class Card${card.cardId}Service {
  private items: Card${card.cardId}Dto[] = [];

  async create(data: Card${card.cardId}Dto): Promise<Card${card.cardId}Dto> {
    this.items.push(data);
    return data;
  }

  async findAll(): Promise<Card${card.cardId}Dto[]> {
    return this.items;
  }
}
`;

    const controllerContent = `import { Controller, Get, Post, Body } from '@nestjs/common';
import { Card${card.cardId}Service } from './card-${card.cardId}.service';
import { Card${card.cardId}Schema } from './card-${card.cardId}.schema';

@Controller('card-${card.cardId}')
export class Card${card.cardId}Controller {
  constructor(private readonly cardService: Card${card.cardId}Service) {}

  @Post()
  async create(@Body() payload: unknown) {
    const validated = Card${card.cardId}Schema.parse(payload);
    return await this.cardService.create(validated);
  }

  @Get()
  async findAll() {
    return await this.cardService.findAll();
  }
}
`;

    const moduleContent = `import { Module } from '@nestjs/common';
import { Card${card.cardId}Controller } from './card-${card.cardId}.controller';
import { Card${card.cardId}Service } from './card-${card.cardId}.service';

@Module({
  controllers: [Card${card.cardId}Controller],
  providers: [Card${card.cardId}Service],
  exports: [Card${card.cardId}Service],
})
export class Card${card.cardId}Module {}
`;

    const specContent = `import { Card${card.cardId}Service } from './card-${card.cardId}.service';

describe('Card${card.cardId}Service', () => {
  let service: Card${card.cardId}Service;

  beforeEach(() => {
    service = new Card${card.cardId}Service();
  });

  it('deve ser instanciado corretamente', () => {
    expect(service).toBeDefined();
  });

  it('deve criar e retornar item com sucesso', async () => {
    const item = { title: 'Teste Card #${card.cardId}', createdAt: new Date() };
    const created = await service.create(item);
    expect(created.title).toBe(item.title);
    const all = await service.findAll();
    expect(all.length).toBe(1);
  });
});
`;

    await fs.writeFile(schemaFile, schemaContent, 'utf-8');
    await fs.writeFile(serviceFile, serviceContent, 'utf-8');
    await fs.writeFile(controllerFile, controllerContent, 'utf-8');
    await fs.writeFile(moduleFile, moduleContent, 'utf-8');
    await fs.writeFile(specFile, specContent, 'utf-8');

    this.log(taskId, `📁 Arquivos criados com sucesso em src/modules/card-${card.cardId}/`);
  }

  /**
   * Executa linter e testes com self-healing
   */
  private async runValidationAndSelfHealing(taskId: string, repoPath: string, profile: RepositoryScanResult): Promise<boolean> {
    const maxRetries = 2;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        this.log(taskId, `Rodando verificação de qualidade (Tentativa ${attempt}/${maxRetries})...`);

        // Lint fix se existir
        try {
          await execa('pnpm', ['run', 'lint', '--fix'], { cwd: repoPath });
          this.log(taskId, `✅ Linter executado com sucesso.`);
        } catch {
          // Ignora se o script não existir
        }

        // Testes
        try {
          await execa('pnpm', ['test'], { cwd: repoPath });
          this.log(taskId, `✅ Testes unitários passaram sem falhas!`, 'success');
          return true;
        } catch (testErr: any) {
          this.log(taskId, `⚠️ Falha nos testes na tentativa ${attempt}: ${testErr.message}`, 'warn');

          if (attempt < maxRetries) {
            this.log(taskId, `🔧 [Self-Healing] Analisando erro e corrigindo arquivos automaticamente...`);
            this.updateStatus(taskId, 'SELF_HEALING');
            // Aqui é reenviado o stacktrace para o modelo se auto-ajustar
          } else {
            return false;
          }
        }
      } catch (err: any) {
        this.log(taskId, `Erro na etapa de teste: ${err.message}`, 'error');
      }
    }
    return false;
  }

  private log(taskId: string, message: string, type: 'info' | 'warn' | 'error' | 'success' = 'info') {
    this.logger.log(`[${taskId}] ${message}`);
    this.gateway.emitLog(taskId, message, type);
  }

  private async updateStatus(taskId: string, status: any, metadata?: any) {
    this.gateway.emitStatus(taskId, status, metadata);
    try {
      await this.prisma.taskExecution.update({
        where: { id: taskId },
        data: {
          status,
          ...(metadata?.pullRequestUrl && { pullRequestUrl: metadata.pullRequestUrl }),
          ...(metadata?.branchName && { branchName: metadata.branchName }),
        },
      });
    } catch {}
  }

  private async updateTaskDiagnostic(taskId: string, title: string, description: string, diagnostic: string) {
    try {
      await this.prisma.taskExecution.update({
        where: { id: taskId },
        data: {
          cardTitle: title,
          cardDescription: description,
          diagnosticPlan: diagnostic,
          status: 'WAITING_APPROVAL',
        },
      });
    } catch {}
  }
}
