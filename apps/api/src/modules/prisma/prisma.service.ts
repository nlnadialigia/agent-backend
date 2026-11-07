import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);

  async onModuleInit() {
    try {
      await this.$connect();
      this.logger.log('✅ Conexão com o PostgreSQL estabelecida com sucesso.');
    } catch (error: any) {
      this.logger.warn(`⚠️ Não foi possível conectar ao PostgreSQL: ${error.message}. O serviço operará quando o banco estiver ativo.`);
    }
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}
