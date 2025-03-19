import { Module } from '@nestjs/common';
import { YandexService } from './yandex.service';
import { ConfigModule } from '@nestjs/config';

@Module({
  imports: [ConfigModule],
  controllers: [],
  providers: [YandexService],
  exports: [YandexService]
})
export class YandexModule {}
