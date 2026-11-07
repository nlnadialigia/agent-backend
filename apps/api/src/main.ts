import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { Logger } from '@nestjs/common';

async function bootstrap() {
  const logger = new Logger('Bootstrap');
  const app = await NestFactory.create(AppModule);

  app.enableCors({
    origin: '*',
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS',
  });

  const port = process.env.PORT || process.env.BACKEND_PORT || 3333;
  await app.listen(port);
  logger.log(`🚀 Agente Backend API rodando em: http://localhost:${port}`);
}

bootstrap();
