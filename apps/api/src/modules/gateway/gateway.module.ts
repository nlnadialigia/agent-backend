import { Global, Module } from '@nestjs/common';
import { AgentGateway } from './agent.gateway';

@Global()
@Module({
  providers: [AgentGateway],
  exports: [AgentGateway],
})
export class GatewayModule {}
