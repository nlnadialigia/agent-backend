import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from './modules/prisma/prisma.module';
import { GatewayModule } from './modules/gateway/gateway.module';
import { RepositoryModule } from './modules/repository/repository.module';
import { AgentModule } from './modules/agent/agent.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env', '../../.env'],
    }),
    PrismaModule,
    GatewayModule,
    RepositoryModule,
    AgentModule,
  ],
})
export class AppModule {}
