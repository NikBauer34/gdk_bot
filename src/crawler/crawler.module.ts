import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { CrawlerService } from './crawler.service';
import { ParserModule } from 'src/parser/parser.module';
import { DataModule } from 'src/data/data.module';
import { YandexModule } from 'src/yandex/yandex.module';
import { AdminModule } from 'src/admin/admin.module';

@Module({
    imports: [
        ConfigModule,
        ScheduleModule.forRoot(),
        ParserModule,
        DataModule,
        YandexModule,
        AdminModule
    ],
    providers: [CrawlerService],
    exports: [CrawlerService]
})
export class CrawlerModule {}
