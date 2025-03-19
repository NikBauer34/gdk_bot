import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AdminService } from './admin.service';
import { PrismaService } from 'src/prisma.service';

@Module({
  imports: [ConfigModule],
  controllers: [],
  providers: [AdminService, PrismaService],
  exports: [AdminService]
})
export class AdminModule {}
