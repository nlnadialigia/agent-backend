import { Controller, Post, Get, Patch, Body, Param, Query } from '@nestjs/common';
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
    this.gateway.handleDecision({
      taskId: id,
      action: approved ? 'APPROVE' : 'REJECT',
    });
    return { success: true, taskId: id, approved };
  }

  @Post(':id/reject')
  async rejectTask(@Param('id') id: string) {
    this.gateway.handleDecision({ taskId: id, action: 'REJECT' });
    return { success: true, taskId: id, action: 'REJECT' };
  }

  @Post(':id/refine')
  async refineTask(
    @Param('id') id: string,
    @Body('feedback') feedback: string,
  ) {
    this.gateway.handleDecision({ taskId: id, action: 'REFINE', feedback });
    return { success: true, taskId: id, action: 'REFINE', feedback };
  }

  @Get('active')
  async getActiveTasks() {
    try {
      return await this.prisma.taskExecution.findMany({
        where: {
          status: {
            notIn: ['COMPLETED', 'FAILED', 'REJECTED'],
          },
          isArchived: false,
        },
        orderBy: { createdAt: 'desc' },
        include: { repository: true },
      });
    } catch {
      return [];
    }
  }

  @Get('history')
  async getHistory(@Query('includeArchived') includeArchived?: string) {
    try {
      const where = includeArchived === 'true' ? {} : { isArchived: false };
      return await this.prisma.taskExecution.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        include: { repository: true },
        take: 50,
      });
    } catch {
      return [];
    }
  }

  @Patch(':id/archive')
  async archiveTask(@Param('id') id: string) {
    try {
      const updated = await this.prisma.taskExecution.update({
        where: { id },
        data: { isArchived: true },
      });
      return { success: true, task: updated };
    } catch (err: any) {
      return { success: false, message: err.message };
    }
  }

  @Patch(':id/restore')
  async restoreTask(@Param('id') id: string) {
    try {
      const updated = await this.prisma.taskExecution.update({
        where: { id },
        data: { isArchived: false },
      });
      return { success: true, task: updated };
    } catch (err: any) {
      return { success: false, message: err.message };
    }
  }
}
