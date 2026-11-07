import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { execa } from 'execa';
import * as fs from 'fs-extra';
import * as path from 'path';

export interface RepositoryScanResult {
  id?: string;
  name: string;
  localPath: string;
  lastCommitHash: string;
  lastAnalyzedAt: Date;
  framework: string;
  languageVersion: string;
  packageManager: string;
  orm: string;
  validationLib: string;
  testFramework: string;
  directoryLayout: Record<string, boolean>;
  codingStandards: Record<string, any>;
  rawDependencies: Record<string, string>;
  isCached: boolean;
}

@Injectable()
export class RepositoryScannerService {
  private readonly logger = new Logger(RepositoryScannerService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Mapeia ou reutiliza o cache do repositório
   */
  async scanRepository(repoPath: string, repoName?: string, forceScan = false): Promise<RepositoryScanResult> {
    const resolvedPath = path.resolve(repoPath);
    const inferredName = repoName || path.basename(resolvedPath);

    if (!await fs.pathExists(resolvedPath)) {
      throw new Error(`Diretório do repositório não encontrado: ${resolvedPath}`);
    }

    // 1. Obter hash atual do commit via Git
    let currentCommit = 'unknown';
    try {
      const { stdout } = await execa('git', ['rev-parse', 'HEAD'], { cwd: resolvedPath });
      currentCommit = stdout.trim();
    } catch (err: any) {
      this.logger.warn(`Não foi possível ler git commit em ${resolvedPath}: ${err.message}`);
    }

    // 2. Verificar cache no banco (se não forçado e se o banco estiver disponível)
    if (!forceScan && currentCommit !== 'unknown') {
      try {
        const cached = await this.prisma.repositoryProfile.findUnique({
          where: { name: inferredName },
        });

        if (cached && cached.lastCommitHash === currentCommit) {
          this.logger.log(`⚡ [Cache Hit] Perfil do repositório '${inferredName}' reutilizado do banco.`);
          return {
            id: cached.id,
            name: cached.name,
            localPath: cached.localPath,
            lastCommitHash: cached.lastCommitHash,
            lastAnalyzedAt: cached.lastAnalyzedAt,
            framework: cached.framework,
            languageVersion: cached.languageVersion,
            packageManager: cached.packageManager,
            orm: cached.orm || 'Nenhum',
            validationLib: cached.validationLib || 'Customizada',
            testFramework: cached.testFramework || 'Jest',
            directoryLayout: cached.directoryLayout as Record<string, boolean>,
            codingStandards: cached.codingStandards as Record<string, any>,
            rawDependencies: cached.rawDependencies as Record<string, string>,
            isCached: true,
          };
        }
      } catch (err: any) {
        this.logger.warn(`Falha na leitura do cache: ${err.message}. Executando scanner...`);
      }
    }

    // 3. Scanner determinístico do repositório
    this.logger.log(`🔍 [Scanner] Analisando estrutura do projeto em '${resolvedPath}'...`);

    const packageJsonPath = path.join(resolvedPath, 'package.json');
    let pkg: any = {};
    if (await fs.pathExists(packageJsonPath)) {
      pkg = await fs.readJson(packageJsonPath);
    } else {
      this.logger.warn(`package.json não encontrado em ${resolvedPath}`);
    }

    const dependencies = { ...(pkg.dependencies || {}), ...(pkg.devDependencies || {}) };

    // Identificação de Framework
    let framework = 'Node/TypeScript Puro';
    if (dependencies['@nestjs/core']) {
      framework = 'NestJS';
    } else if (dependencies['fastify']) {
      framework = 'Fastify';
    } else if (dependencies['express']) {
      framework = 'Express';
    } else if (dependencies['koa']) {
      framework = 'Koa';
    }

    // Identificação de Biblioteca de Validação
    let validationLib = 'Nenhuma/Custom';
    if (dependencies['zod'] || dependencies['nestjs-zod']) {
      validationLib = 'Zod';
    } else if (dependencies['class-validator']) {
      validationLib = 'class-validator';
    } else if (dependencies['yup']) {
      validationLib = 'Yup';
    } else if (dependencies['joi']) {
      validationLib = 'Joi';
    }

    // Identificação de ORM / Acesso a Banco
    let orm = 'Nenhum';
    if (dependencies['@prisma/client'] || dependencies['prisma']) {
      orm = 'Prisma';
    } else if (dependencies['typeorm']) {
      orm = 'TypeORM';
    } else if (dependencies['drizzle-orm']) {
      orm = 'Drizzle';
    } else if (dependencies['mongoose']) {
      orm = 'Mongoose';
    } else if (dependencies['knex']) {
      orm = 'Knex';
    }

    // Identificação de Framework de Teste
    let testFramework = 'Jest';
    if (dependencies['vitest']) {
      testFramework = 'Vitest';
    } else if (dependencies['jest'] || dependencies['ts-jest']) {
      testFramework = 'Jest';
    }

    // Identificação de Package Manager
    let packageManager = 'pnpm';
    if (await fs.pathExists(path.join(resolvedPath, 'pnpm-lock.yaml'))) {
      packageManager = 'pnpm';
    } else if (await fs.pathExists(path.join(resolvedPath, 'yarn.lock'))) {
      packageManager = 'yarn';
    } else if (await fs.pathExists(path.join(resolvedPath, 'package-lock.json'))) {
      packageManager = 'npm';
    }

    // Mapeamento de Layout de Diretórios
    const directoryLayout: Record<string, boolean> = {
      hasModules: await fs.pathExists(path.join(resolvedPath, 'src', 'modules')),
      hasControllers: await fs.pathExists(path.join(resolvedPath, 'src', 'controllers')),
      hasServices: await fs.pathExists(path.join(resolvedPath, 'src', 'services')),
      hasPrismaSchema: await fs.pathExists(path.join(resolvedPath, 'prisma', 'schema.prisma')),
      hasTestsDir: await fs.pathExists(path.join(resolvedPath, 'test')) || await fs.pathExists(path.join(resolvedPath, 'tests')),
      hasEslint: await fs.pathExists(path.join(resolvedPath, '.eslintrc.js')) || await fs.pathExists(path.join(resolvedPath, 'eslint.config.js')),
    };

    const codingStandards: Record<string, any> = {
      useStrictZod: validationLib === 'Zod',
      strictTypes: true,
      hasPrettier: await fs.pathExists(path.join(resolvedPath, '.prettierrc')),
    };

    const scanData = {
      name: inferredName,
      localPath: resolvedPath,
      lastCommitHash: currentCommit,
      lastAnalyzedAt: new Date(),
      framework,
      languageVersion: 'TypeScript 5.x / Node.js',
      packageManager,
      orm,
      validationLib,
      testFramework,
      directoryLayout,
      codingStandards,
      rawDependencies: dependencies,
      isCached: false,
    };

    // 4. Salvar/Atualizar no Banco
    try {
      const saved = await this.prisma.repositoryProfile.upsert({
        where: { name: inferredName },
        create: {
          name: inferredName,
          localPath: resolvedPath,
          lastCommitHash: currentCommit,
          framework,
          languageVersion: scanData.languageVersion,
          packageManager,
          orm,
          validationLib,
          testFramework,
          directoryLayout,
          codingStandards,
          rawDependencies: dependencies,
        },
        update: {
          localPath: resolvedPath,
          lastCommitHash: currentCommit,
          lastAnalyzedAt: new Date(),
          framework,
          languageVersion: scanData.languageVersion,
          packageManager,
          orm,
          validationLib,
          testFramework,
          directoryLayout,
          codingStandards,
          rawDependencies: dependencies,
        },
      });

      return {
        ...scanData,
        id: saved.id,
      };
    } catch (err: any) {
      this.logger.warn(`Não foi possível persistir no banco (offline?): ${err.message}`);
      return scanData;
    }
  }

  /**
   * Lista todos os repositórios disponíveis no diretório base ou cadastrados no banco
   */
  async listRepositories(baseDir?: string) {
    const searchDir = baseDir || process.env.REPOS_BASE_DIR || path.join(process.cwd(), '..');
    const detected: Array<{ name: string; path: string }> = [];

    if (await fs.pathExists(searchDir)) {
      const entries = await fs.readdir(searchDir, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.isDirectory() && !entry.name.startsWith('.')) {
          const fullPath = path.join(searchDir, entry.name);
          const hasPackageJson = await fs.pathExists(path.join(fullPath, 'package.json'));
          if (hasPackageJson) {
            detected.push({ name: entry.name, path: fullPath });
          }
        }
      }
    }

    // Busca dados do banco
    let dbProfiles: any[] = [];
    try {
      dbProfiles = await this.prisma.repositoryProfile.findMany({
        orderBy: { lastAnalyzedAt: 'desc' },
      });
    } catch (err: any) {
      this.logger.warn(`Erro ao consultar perfis do banco: ${err.message}`);
    }

    return {
      availableOnDisk: detected,
      cachedInDatabase: dbProfiles,
    };
  }
}
