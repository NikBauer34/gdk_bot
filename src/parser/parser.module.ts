import { Module } from '@nestjs/common';
import { ParserService } from './parser.service';
import { YandexModule } from 'src/yandex/yandex.module';
import { PrismaService } from 'src/prisma.service';
import { ConfigModule } from '@nestjs/config';

@Module({
  imports: [YandexModule, ConfigModule],
  providers: [ParserService, PrismaService],
  exports: [ParserService]
})
export class ParserModule {}
