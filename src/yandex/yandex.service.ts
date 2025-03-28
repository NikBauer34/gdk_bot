import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios, { AxiosInstance, AxiosResponse } from 'axios';
import { CompData, FullCompData } from 'src/config/api.data';
import { YandexApiInterceptor } from './api/api.interceptors';
import { YandexCompDto, YandexEmbeddingDto } from './dto/yandex.dto';

@Injectable()
export class YandexService {
    private readonly axiosInstance: AxiosInstance;
    constructor(private readonly configService: ConfigService) {
        const yandexApi = new YandexApiInterceptor(configService);
        this.axiosInstance = yandexApi.getInstance();
    }

    async getComp(question: string): Promise<{text: string, tokens: number}> {
        try {

            const response: AxiosResponse<YandexCompDto> = await this.axiosInstance.post('https://llm.api.cloud.yandex.net/foundationModels/v1/completion', {
                modelUri: this.configService.getOrThrow<string>('yandexApiModelUriComp'),
                completionOptions: CompData.completionOptions,
                messages: [
                    {
                        "role": "system",
                        "text": "Обрабатывай запросы пользователей, извлекая из них ключевые слова, которые четко отражают интересы. Сокращай ответы до одной-двух слов, указывая только то, что пользователь хочет найти."
                      },
                    {
                        "role": "user",
                        "text": question
                    }
                ]
            }, {
            });
            console.log(response.data.result.alternatives[0].message.text);
            return {text:response.data.result.alternatives[0].message.text, tokens: response.data.result.usage.totalTokens};
        } catch (error) {
            throw new HttpException('Ошибка при получении ответа от Yandex', HttpStatus.INTERNAL_SERVER_ERROR);
        }
    }
    async getEmbedding(text: string) {
        try {
            const response: AxiosResponse<YandexEmbeddingDto> = await this.axiosInstance.post('https://llm.api.cloud.yandex.net/foundationModels/v1/textEmbedding', {
                modelUri: this.configService.getOrThrow<string>('yandexApiModelUriEmb'),
                text: text
            });
            return {embedding: response.data.embedding, tokens: response.data.numTokens};
        } catch (error) {
            console.log(error);
            throw new HttpException('Ошибка при получении ответа от Yandex', HttpStatus.INTERNAL_SERVER_ERROR);
        }
    }
    calculateCosineSimilarity(embedding1: number[], embedding2: number[]): number {
        if (embedding1.length !== embedding2.length) {
          throw new Error('Embeddings must have the same length.');
        }
    
        let dotProduct = 0;
        let magnitude1 = 0;
        let magnitude2 = 0;
    
        for (let i = 0; i < embedding1.length; i++) {
          dotProduct += embedding1[i] * embedding2[i];
          magnitude1 += embedding1[i] * embedding1[i];
          magnitude2 += embedding2[i] * embedding2[i];
        }
    
        magnitude1 = Math.sqrt(magnitude1);
        magnitude2 = Math.sqrt(magnitude2);
    
        if (magnitude1 === 0 || magnitude2 === 0) {
          return 0; //  Чтобы избежать деления на ноль
        }
    
        return dotProduct / (magnitude1 * magnitude2);
      }
    
    async getAnswer(question: string, content: string): Promise<{text: string, tokens: number}> {
        try {
            console.log(content);
            console.log(question);
            const response: AxiosResponse<YandexCompDto> = await this.axiosInstance.post('https://llm.api.cloud.yandex.net/foundationModels/v1/completion', {
                modelUri: this.configService.getOrThrow<string>('yandexApiModelUriComp'),
                completionOptions: FullCompData.completionOptions,
                messages: [
                    {
                        "role": "system",
                        "text": "Ты - бот-помощник. Отвечай на вопросы пользователей, используя ТОЛЬКО информацию из предоставленного текста, не используя информацию извне"
                    },
                    {
                        "role": "user",
                        "text": `Вот текст, на основе которого нужно ответить на вопрос:\n\n${content}\n\nВопрос: ${question}`
                    }
                ]
            });
            return {text: response.data.result.alternatives[0].message.text, tokens: response.data.result.usage.totalTokens};
        } catch (error) {
            throw new HttpException('Ошибка при получении ответа от Yandex', HttpStatus.INTERNAL_SERVER_ERROR);
        }
    }
}
