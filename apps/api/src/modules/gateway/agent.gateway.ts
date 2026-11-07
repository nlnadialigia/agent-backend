import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { Injectable, Logger } from '@nestjs/common';

export type HumanDecision =
  | { action: 'APPROVE' }
  | { action: 'REJECT' }
  | { action: 'REFINE'; feedback: string };

@WebSocketGateway({
  cors: {
    origin: '*',
  },
})
@Injectable()
export class AgentGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server!: Server;

  private readonly logger = new Logger(AgentGateway.name);
  private approvalResolvers = new Map<string, (approved: boolean) => void>();
  private decisionResolvers = new Map<string, (decision: HumanDecision) => void>();

  handleConnection(client: Socket) {
    this.logger.log(`Cliente conectado via WebSocket: ${client.id}`);
  }

  handleDisconnect(client: Socket) {
    this.logger.log(`Cliente desconectado: ${client.id}`);
  }

  /**
   * Envia mensagem de log em tempo real para os clientes conectados
   */
  emitLog(taskId: string, message: string, type: 'info' | 'warn' | 'error' | 'success' = 'info') {
    if (this.server) {
      this.server.emit('task:log', {
        taskId,
        message,
        type,
        timestamp: new Date().toISOString(),
      });
    }
  }

  /**
   * Atualiza status da tarefa em tempo real
   */
  emitStatus(taskId: string, status: string, metadata?: any) {
    if (this.server) {
      this.server.emit('task:status', {
        taskId,
        status,
        metadata,
        timestamp: new Date().toISOString(),
      });
    }
  }

  /**
   * Solicita aprovação humana enviando o diagnóstico e retorna uma Promise aguardando resposta
   */
  requestApproval(taskId: string, diagnostic: string, timeoutMs = 600000): Promise<boolean> {
    return new Promise((resolve) => {
      this.emitStatus(taskId, 'WAITING_APPROVAL', { diagnostic });
      if (this.server) {
        this.server.emit('task:approval_required', { taskId, diagnostic });
      }

      this.approvalResolvers.set(taskId, resolve);

      // Timeout de segurança (10 minutos)
      setTimeout(() => {
        if (this.approvalResolvers.has(taskId)) {
          this.logger.warn(`Aprovação expirou por timeout para tarefa ${taskId}`);
          this.approvalResolvers.delete(taskId);
          resolve(false);
        }
      }, timeoutMs);
    });
  }

  /**
   * Solicita decisão humana (Aprovar, Rejeitar ou Refinar com Feedback)
   */
  requestDecision(taskId: string, diagnostic: string, timeoutMs = 600000): Promise<HumanDecision> {
    return new Promise((resolve) => {
      this.emitStatus(taskId, 'WAITING_APPROVAL', { diagnostic });
      if (this.server) {
        this.server.emit('task:approval_required', { taskId, diagnostic });
      }

      this.decisionResolvers.set(taskId, resolve);

      setTimeout(() => {
        if (this.decisionResolvers.has(taskId)) {
          this.logger.warn(`Decisão expirou por timeout para tarefa ${taskId}`);
          this.decisionResolvers.delete(taskId);
          resolve({ action: 'REJECT' });
        }
      }, timeoutMs);
    });
  }

  handleDecision(payload: { taskId: string; action: 'APPROVE' | 'REJECT' | 'REFINE'; feedback?: string }) {
    this.logger.log(`Decisão de aprovação recebida para ${payload.taskId}: ${payload.action}`);
    const resolver = this.decisionResolvers.get(payload.taskId);
    if (resolver) {
      if (payload.action === 'REFINE') {
        resolver({ action: 'REFINE', feedback: payload.feedback || '' });
      } else if (payload.action === 'APPROVE') {
        resolver({ action: 'APPROVE' });
      } else {
        resolver({ action: 'REJECT' });
      }
      this.decisionResolvers.delete(payload.taskId);
    }

    const oldResolver = this.approvalResolvers.get(payload.taskId);
    if (oldResolver) {
      oldResolver(payload.action === 'APPROVE');
      this.approvalResolvers.delete(payload.taskId);
    }
  }

  @SubscribeMessage('task:decision')
  onTaskDecision(client: Socket, payload: { taskId: string; action: 'APPROVE' | 'REJECT' | 'REFINE'; feedback?: string }) {
    this.handleDecision(payload);
  }

  @SubscribeMessage('task:approve')
  handleApproval(client: Socket, payload: { taskId: string; approved: boolean }) {
    this.handleDecision({
      taskId: payload.taskId,
      action: payload.approved ? 'APPROVE' : 'REJECT',
    });
  }
}
