import { Module } from '@nestjs/common';
import { AgentRunnerService } from './agent-runner.service';
import { AgentController } from './agent.controller';
import { KanbanizeService } from './kanbanize.service';
import { AzureDevOpsService } from './azure-devops.service';
import { RepositoryModule } from '../repository/repository.module';

@Module({
  imports: [RepositoryModule],
  controllers: [AgentController],
  providers: [AgentRunnerService, KanbanizeService, AzureDevOpsService],
  exports: [AgentRunnerService],
})
export class AgentModule {}
