import { Controller, Get, Post, Body, Query } from '@nestjs/common';
import { RepositoryScannerService } from './repository-scanner.service';

@Controller('repositories')
export class RepositoryController {
  constructor(private readonly scannerService: RepositoryScannerService) {}

  @Get()
  async list(@Query('baseDir') baseDir?: string) {
    return await this.scannerService.listRepositories(baseDir);
  }

  @Post('scan')
  async scan(
    @Body('repoPath') repoPath: string,
    @Body('repoName') repoName?: string,
    @Body('force') force?: boolean,
  ) {
    return await this.scannerService.scanRepository(repoPath, repoName, !!force);
  }
}
