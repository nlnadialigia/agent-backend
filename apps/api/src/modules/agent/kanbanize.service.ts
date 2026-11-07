import { Injectable, Logger } from '@nestjs/common';
import axios from 'axios';

export interface KanbanizeCard {
  cardId: string;
  title: string;
  description: string;
  tags?: string[];
  boardId?: number;
}

@Injectable()
export class KanbanizeService {
  private readonly logger = new Logger(KanbanizeService.name);

  async getCard(cardId: string): Promise<KanbanizeCard> {
    const apiKey = process.env.KANBANIZE_API_KEY;
    const subdomain = process.env.KANBANIZE_SUBDOMAIN;

    if (!apiKey || !subdomain) {
      this.logger.warn('Credenciais do Kanbanize não configuradas no .env. Utilizando mock de desenvolvimento.');
      return {
        cardId,
        title: `Implementar Serviço de Backend para Card #${cardId}`,
        description: `Implementar endpoints REST, validação rigorosa de schemas e cobertura de testes unitários para a funcionalidade #${cardId}.`,
        tags: ['backend', 'typescript'],
      };
    }

    try {
      const url = `https://${subdomain}.kanbanize.com/api/v2/cards/${cardId}`;
      const response = await axios.get(url, {
        headers: {
          apikey: apiKey,
          'Content-Type': 'application/json',
        },
        timeout: 10000,
      });

      const data = response.data?.data;
      return {
        cardId,
        title: data.title || `Card #${cardId}`,
        description: data.description || '',
        tags: data.tag_ids || [],
        boardId: data.board_id,
      };
    } catch (error: any) {
      this.logger.error(`Erro ao consultar card #${cardId} no Kanbanize: ${error.message}`);
      throw new Error(`Falha ao buscar Card #${cardId} no Kanbanize: ${error.response?.data?.message || error.message}`);
    }
  }
}
