import { Module } from '@nestjs/common';
import { VkService } from './vk.service';
import { CrawlerModule } from 'src/crawler/crawler.module';
import { ConfigModule } from '@nestjs/config';
import { YandexModule } from 'src/yandex/yandex.module';
import { PrismaService } from 'src/prisma.service';
import { AdminModule } from 'src/admin/admin.module';
import { WorkerModule } from 'src/worker/worker.module';
import { MessageModule } from 'src/message/message.module';
import { DataModule } from 'src/data/data.module';
@Module({
  imports: [YandexModule, CrawlerModule, ConfigModule, AdminModule, WorkerModule, MessageModule, DataModule ],
  providers: [VkService, PrismaService]
})
export class VkModule {}
