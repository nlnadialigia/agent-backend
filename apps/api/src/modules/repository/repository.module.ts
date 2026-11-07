import { Module } from '@nestjs/common';
import { RepositoryScannerService } from './repository-scanner.service';
import { RepositoryController } from './repository.controller';

@Module({
  controllers: [RepositoryController],
  providers: [RepositoryScannerService],
  exports: [RepositoryScannerService],
})
export class RepositoryModule {}
