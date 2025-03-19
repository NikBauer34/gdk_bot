import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { CrawlerModule } from './crawler/crawler.module';
import { AdminModule } from './admin/admin.module';
import { MessageModule } from './message/message.module';
import { WorkerModule } from './worker/worker.module';
import { YandexModule } from './yandex/yandex.module';
import { AppController } from './app.controller';
import { DataModule } from './data/data.module';
import { VkModule } from './vk/vk.module';
import { ParserModule } from './parser/parser.module';
import configuration from './config/configuration';

@Module({
  imports: [ 
    ConfigModule.forRoot({
      load: [configuration],
      isGlobal: true,
    }), CrawlerModule, AdminModule, MessageModule, WorkerModule, YandexModule, ParserModule, DataModule, VkModule],
  controllers: [AppController],
  providers: [],
})
export class AppModule {}
