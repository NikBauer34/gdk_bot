import { Module } from '@nestjs/common';
import { WorkerService } from './worker.service';
import { PrismaService } from 'src/prisma.service';
import { ConfigModule } from '@nestjs/config';
@Module({
  imports: [ConfigModule],
  controllers: [],
  providers: [WorkerService, PrismaService  ],
  exports: [WorkerService]
})
export class WorkerModule {}
