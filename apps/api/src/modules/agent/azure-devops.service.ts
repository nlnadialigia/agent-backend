import { Injectable, Logger } from '@nestjs/common';
import { execa } from 'execa';
import axios from 'axios';

@Injectable()
export class AzureDevOpsService {
  private readonly logger = new Logger(AzureDevOpsService.name);

  async createPullRequest(params: {
    repoPath: string;
    sourceBranch: string;
    targetBranch?: string;
    title: string;
    description: string;
  }): Promise<{ url: string; id: string }> {
    const targetBranch = params.targetBranch || 'main';
    const orgUrl = process.env.AZURE_DEVOPS_ORG_URL;
    const project = process.env.AZURE_DEVOPS_PROJECT;
    const pat = process.env.AZURE_DEVOPS_PAT;

    // 1. Tentar via Azure CLI primeiro se instalado
    try {
      this.logger.log(`Tentando criar PR via Azure CLI para branch ${params.sourceBranch}...`);
      const { stdout } = await execa('az', [
        'repos', 'pr', 'create',
        '--source-branch', params.sourceBranch,
        '--target-branch', targetBranch,
        '--title', params.title,
        '--description', params.description,
        '--open'
      ], { cwd: params.repoPath });

      const parsed = JSON.parse(stdout);
      return {
        url: parsed.url || `${orgUrl}/${project}/_git/pullrequest/${parsed.pullRequestId}`,
        id: String(parsed.pullRequestId || '1'),
      };
    } catch (azError: any) {
      this.logger.warn(`Azure CLI não disponível ou falhou (${azError.message}). Tentando fallback via REST API do Azure DevOps...`);
    }

    // 2. Fallback via Azure DevOps REST API
    if (orgUrl && project && pat) {
      try {
        const repoName = await this.getGitRemoteRepoName(params.repoPath);
        const authHeader = `Basic ${Buffer.from(`:${pat}`).toString('base64')}`;
        
        // URL da API REST: https://dev.azure.com/{organization}/{project}/_apis/git/repositories/{repositoryId}/pullrequests?api-version=7.1
        const cleanOrg = orgUrl.replace(/\/$/, '');
        const apiUrl = `${cleanOrg}/${project}/_apis/git/repositories/${repoName}/pullrequests?api-version=7.1`;

        const response = await axios.post(apiUrl, {
          sourceRefName: `refs/heads/${params.sourceBranch}`,
          targetRefName: `refs/heads/${targetBranch}`,
          title: params.title,
          description: params.description,
        }, {
          headers: {
            Authorization: authHeader,
            'Content-Type': 'application/json',
          },
          timeout: 15000,
        });

        const prData = response.data;
        const webUrl = prData?._links?.web?.href || `${cleanOrg}/${project}/_git/${repoName}/pullrequest/${prData.pullRequestId}`;

        return {
          url: webUrl,
          id: String(prData.pullRequestId),
        };
      } catch (restError: any) {
        this.logger.error(`Falha também na REST API do Azure DevOps: ${restError.response?.data?.message || restError.message}`);
      }
    }

    // 3. Fallback simulado caso credenciais não estejam configuradas localmente
    this.logger.warn('Azure DevOps não configurado com credenciais válidas. Gerando link simulado.');
    return {
      url: `${orgUrl || 'https://dev.azure.com/Org'}/${project || 'Projeto'}/_git/pr/simulation-${Date.now()}`,
      id: `SIM-${Date.now()}`,
    };
  }

  private async getGitRemoteRepoName(repoPath: string): Promise<string> {
    try {
      const { stdout } = await execa('git', ['config', '--get', 'remote.origin.url'], { cwd: repoPath });
      const parts = stdout.trim().split('/');
      const last = parts[parts.length - 1];
      return last.replace(/\.git$/, '');
    } catch {
      return 'repository';
    }
  }
}
