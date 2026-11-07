import { Controller, Post, Get, Body, Param } from '@nestjs/common';
import { AgentRunnerService, ExecuteTaskDto } from './agent-runner.service';
import { AgentGateway } from '../gateway/agent.gateway';
import { PrismaService } from '../prisma/prisma.service';

@Controller('tasks')
export class AgentController {
  constructor(
    private readonly runner: AgentRunnerService,
    private readonly gateway: AgentGateway,
    private readonly prisma: PrismaService,
  ) {}

  @Post('start')
  async startTask(@Body() dto: ExecuteTaskDto) {
    return await this.runner.startTask(dto);
  }

  @Post(':id/approve')
  async approveTask(
    @Param('id') id: string,
    @Body('approved') approved: boolean,
  ) {
    this.gateway.handleApproval({} as any, { taskId: id, approved });
    return { success: true, taskId: id, approved };
  }

  @Get('history')
  async getHistory() {
    try {
      return await this.prisma.taskExecution.findMany({
        orderBy: { createdAt: 'desc' },
        include: { repository: true },
        take: 50,
      });
    } catch {
      return [];
    }
  }
}
