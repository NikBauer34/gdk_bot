import { Injectable, OnModuleInit } from '@nestjs/common';
import { VK, KeyboardBuilder } from 'vk-io';
import { ConfigService } from '@nestjs/config';
import { AdminService } from 'src/admin/admin.service';
import { CrawlerService } from 'src/crawler/crawler.service';
import { PrismaService } from 'src/prisma.service';
import { YandexService } from 'src/yandex/yandex.service';
import { MessageService } from 'src/message/message.service';
import { WorkerService } from 'src/worker/worker.service';
import { SectionsDataType } from 'src/data/dto/sections.dto';
import { DataService } from 'src/data/data.service';
import * as XLSX from 'xlsx';
import * as path from 'path';
import * as fs from 'fs';

@Injectable()
export class VkService implements OnModuleInit {
    private vk: VK;
    private readonly authStates = new Map<number, string>();
    private readonly workerStates = new Map<number, string>();
    private readonly searchStates = new Map<number, string>();
    private readonly messageTimestamps = new Map<number, number[]>();
    private readonly RATE_LIMIT = 70; // Maximum messages per window
    private readonly RATE_WINDOW = 60000; // Time window in milliseconds (1 minute)

    constructor(
        private readonly configService: ConfigService,
        private readonly adminService: AdminService,
        private readonly workerService: WorkerService,
        private readonly messageService: MessageService,
        private readonly crawlerService: CrawlerService,
        private readonly yandexService: YandexService,
        private readonly prisma: PrismaService,
        private readonly dataService: DataService,
    ) {}

    cosineSimilarity(embedding1: number[], embedding2: number[]) {
        /**
         * Вычисляет косинусное сходство между двумя эмбеддингами.
         *
         * Args:
         *   embedding1: Массив из 256 чисел, представляющий первый эмбеддинг.
         *   embedding2: Массив из 256 чисел, представляющий второй эмбеддинг.
         *
         * Returns:
         *   Косинусное сходство между двумя эмбеддингами (число от -1 до 1).
         */
      
        if (embedding1.length !== 256 || embedding2.length !== 256) {
          throw new Error("Эмбеддинги должны быть длиной 256.");
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
            return 0.0; // Обработка случая нулевых векторов
        }
      
        return dotProduct / (magnitude1 * magnitude2);
      }
    private async initializeVkBot() {
        try {
            const token = this.configService.getOrThrow<string>('VK_TOKEN');

            if (!token) {
                throw new Error('VK_TOKEN is not set in environment variables');
            }


        this.vk = new VK({
                token: token
            });

            this.setupMessageHandlers();
            await this.vk.updates.start();
            console.log('VK bot started successfully');
        } catch (error) {
            console.error('Error initializing VK bot:', error);
            throw error;
        }
    }

    private isRateLimited(senderId: number): boolean {
        const now = Date.now();
        const timestamps = this.messageTimestamps.get(senderId) || [];
        
        // Remove timestamps older than the window
        const recentTimestamps = timestamps.filter(timestamp => now - timestamp < this.RATE_WINDOW);
        
        // Update timestamps for this user
        this.messageTimestamps.set(senderId, recentTimestamps);
        
        // Check if user has exceeded rate limit
        if (recentTimestamps.length >= this.RATE_LIMIT) {
            const oldestTimestamp = recentTimestamps[0];
            const timeLeft = Math.ceil((this.RATE_WINDOW - (now - oldestTimestamp)) / 1000);
            return true;
        }
        
        // Add current timestamp
        recentTimestamps.push(now);
        this.messageTimestamps.set(senderId, recentTimestamps);
        return false;
    }

    private setupMessageHandlers() {
        this.vk.updates.on('message_new', async (context) => {
            try {
                const text = context.text?.toLowerCase() || '';
                const senderId = context.senderId;
                const adminPassword = this.configService.getOrThrow<string>('adminPassword');

                // Skip rate limiting for admin commands and worker authentication
                if (!['начать', 'для рабочих'].includes(text) && 
                    !this.authStates.has(senderId) && 
                    !this.workerStates.has(senderId)) {
                    
                    if (this.isRateLimited(senderId)) {
                        const keyboard = new KeyboardBuilder()
                            .textButton({
                                label: 'Поиск по сайту ГДК',
                                color: 'primary'
                            })
                            .textButton({
                                label: 'Поиск по группе ВК',
                                color: 'primary'
                            })
                            .row()
                            .textButton({
                                label: 'Комбинир. поиск (ВК + сайт)',
                                color: 'primary'
                            })
                            .textButton({
                                label: 'Для рабочих',
                                color: 'primary'
                            })
                            .oneTime();

                        return await context.send(
                            'Пожалуйста, подождите немного перед отправкой следующего сообщения. Слишком много запросов за короткое время.',
                            { keyboard }
                        );
                    }
                }

                // Handle "Начать" command
                if (text === 'начать') {
                    const keyboard = new KeyboardBuilder()
                        .textButton({
                            label: 'Поиск по сайту ГДК',
                            color: 'primary'
                        })
                        .textButton({
                            label: 'Поиск по группе ВК',
                            color: 'primary'
                        })
                        .row()
                        .textButton({
                            label: 'Комбинир. поиск (ВК + сайт)',
                            color: 'primary'
                        })
                        .textButton({
                            label: 'Для рабочих',
                            color: 'primary'
                        })
                        .oneTime();

                    return await context.send('Добро пожаловать! Выберите режим поиска:', { keyboard });
                }

                // Handle "Поиск по сайту ГДК" button
                if (text === 'поиск по сайту гдк') {
                    const keyboard = new KeyboardBuilder()
                        .textButton({
                            label: 'Найти раздел',
                            color: 'primary'
                        })
                        .textButton({
                            label: 'Ответить на вопрос по сайту',
                            color: 'primary'
                        })
                        .oneTime();

                    return await context.send('Выберите режим поиска:', { keyboard });
                }

                // Handle "Поиск по группе ВК" button
                if (text === 'поиск по группе вк') {
                    const keyboard = new KeyboardBuilder()
                        .textButton({
                            label: 'Найти пост',
                            color: 'primary'
                        })
                        .textButton({
                            label: 'Ответить на вопрос по постам',
                            color: 'primary'
                        })
                        .oneTime();

                    return await context.send('Выберите режим поиска:', { keyboard });
                }

                // Handle "Найти раздел" button
                if (text === 'найти раздел') {
                    this.searchStates.set(senderId, 'waiting_for_query');
                    return await context.send('Введите ваш поисковый запрос:');
                }

                // Handle "Найти пост" button
                if (text === 'найти пост') {
                    this.searchStates.set(senderId, 'waiting_for_vk_query');
                    return await context.send('Введите ваш поисковый запрос:');
                }

                // Handle "Ответить на вопрос по сайту" button
                if (text === 'ответить на вопрос по сайту') {
                    this.searchStates.set(senderId, 'waiting_for_question');
                    return await context.send('Введите ваш вопрос:');
                }

                // Handle "Ответить на вопрос по постам" button
                if (text === 'ответить на вопрос по постам') {
                    this.searchStates.set(senderId, 'waiting_for_vk_question');
                    return await context.send('Введите ваш вопрос:');
                }

                // Handle "Комбинир. поиск (ВК + сайт)" button
                if (text === 'комбинир. поиск (вк + сайт)') {
                    const keyboard = new KeyboardBuilder()
                        .textButton({
                            label: 'Найти в обоих источниках',
                            color: 'primary'
                        })
                        .textButton({
                            label: 'Ответить на вопрос по обоим источникам',
                            color: 'primary'
                        })
                        .oneTime();

                    return await context.send('Выберите режим поиска:', { keyboard });
                }

                // Handle "Найти в обоих источниках" button
                if (text === 'найти в обоих источниках') {
                    this.searchStates.set(senderId, 'waiting_for_combined_query');
                    return await context.send('Введите ваш поисковый запрос:');
                }

                // Handle "Ответить на вопрос по обоим источникам" button
                if (text === 'ответить на вопрос по обоим источникам') {
                    this.searchStates.set(senderId, 'waiting_for_combined_question');
                    return await context.send('Введите ваш вопрос:');
                }

                // Handle website question input
                if (this.searchStates.get(senderId) === 'waiting_for_question') {
                    try {
                        // Get embedding directly without compression
                        const questionEmbedding = await this.yandexService.getEmbedding(text);
                        
                        // Get sections data from crawler service
                        const sections = await this.crawlerService.getSectionsData();
                        
                        // Find the most similar section
                        let mostRelevantSection: SectionsDataType | null = null;
                        let highestSectionSimilarity = -1;
                        
                        for (const section of sections) {
                            const sectionSimilarity = this.cosineSimilarity(questionEmbedding.embedding, section.embedding);
                            if (sectionSimilarity > highestSectionSimilarity) {
                                highestSectionSimilarity = sectionSimilarity;
                                mostRelevantSection = section;
                            }
                        }

                        if (mostRelevantSection) {
                            // Get answer using the full question and section content
                            let sectionContent = mostRelevantSection.content;
                            console.log('Best matching section content:', sectionContent);
                            
                            // If the closest section is either Мероприятия, События or Новости, include all sections
                            if (mostRelevantSection.name === "Мероприятия" || mostRelevantSection.name === "События" || mostRelevantSection.name === "Новости") {
                                const allSections = await this.crawlerService.getSectionsData();
                                const meropriyatiyaSection = allSections.find(s => s.name === "Мероприятия");
                                const sobytiyaSection = allSections.find(s => s.name === "События");
                                const novostiSection = allSections.find(s => s.name === "Новости");
                                
                                if (meropriyatiyaSection && sobytiyaSection && novostiSection) {
                                    sectionContent = `${meropriyatiyaSection.content}\n\n${sobytiyaSection.content}\n\n${novostiSection.content}`;
                                    console.log('Combined Мероприятия, События and Новости content:', sectionContent);
                                }
                            }
                            console.log(sectionContent)
                            const answer = await this.yandexService.getAnswer(text, sectionContent);

                            // Update database with request count and token usage
                            await this.prisma.admin.update({
                                where: { id: adminPassword },
                                data: {
                                    total_request_amount: { increment: 1 },
                                    total_tokens_emb_amount: { increment: Number(questionEmbedding.tokens) },
                                    total_tokens_comp_amount: { increment: Number(answer.tokens) },
                                    requests_data: {
                                        push: {
                                            data: new Date(),
                                            theme: mostRelevantSection.name,
                                            type: "Ответить на вопрос",
                                            token_emb: Number(questionEmbedding.tokens),
                                            token_comp: Number(answer.tokens) || 0
                                        }
                                    }
                                }
                            });

                            const navigationKeyboard = new KeyboardBuilder()
                                .textButton({
                                    label: 'Поиск по сайту ГДК',
                                    color: 'primary'
                                })
                                .textButton({
                                    label: 'Поиск по группе ВК',
                                    color: 'primary'
                                })
                                .row()
                                .textButton({
                                    label: 'Комбинир. поиск (ВК + сайт)',
                                    color: 'primary'
                                })
                                .textButton({
                                    label: 'Для рабочих',
                                    color: 'primary'
                                })
                                .oneTime();

                            this.searchStates.delete(senderId);
                            return await context.send(
                                `Ответ на ваш вопрос:\n\n${answer.text}`,
                                { keyboard: navigationKeyboard }
                            );
                        }
                    } catch (error) {
                        console.error('Error processing website question:', error);
                        this.searchStates.delete(senderId);
                        return await context.send('Произошла ошибка при обработке вопроса. Попробуйте позже.');
                    }
                }

                // Handle VK question input
                if (this.searchStates.get(senderId) === 'waiting_for_vk_question') {
                    try {
                        // Get embedding directly without compression
                        const questionEmbedding = await this.yandexService.getEmbedding(text);
                        
                        // Get posts data from data service
                        const posts = await this.dataService.getPostsData();
                        
                        // Find the most similar post
                        let mostRelevantPost: {name: string, url: string, content: string, embedding: number[]} | null = null;
                        let highestPostSimilarity = -1;
                        
                        for (const post of posts) {
                            const postSimilarity = this.cosineSimilarity(questionEmbedding.embedding, post.embedding);
                            if (postSimilarity > highestPostSimilarity) {
                                highestPostSimilarity = postSimilarity;
                                mostRelevantPost = post;
                            }
                        }

                        if (mostRelevantPost) {
                            // Get answer using the full question and post content
                            console.log('Best matching post content:', mostRelevantPost.content);
                            const answer = await this.yandexService.getAnswer(text, mostRelevantPost.content);

                            // Update database with request count and token usage
                            await this.prisma.admin.update({
                                where: { id: adminPassword },
                                data: {
                                    total_request_amount: { increment: 1 },
                                    total_tokens_emb_amount: { increment: Number(questionEmbedding.tokens) },
                                    total_tokens_comp_amount: { increment: Number(answer.tokens) },
                                    requests_data: {
                                        push: {
                                            data: new Date(),
                                            theme: "Пост",
                                            type: "Ответить на вопрос",
                                            token_emb: Number(questionEmbedding.tokens),
                                            token_comp: Number(answer.tokens) || 0
                                        }
                                    }
                                }
                            });

                            const navigationKeyboard = new KeyboardBuilder()
                                .textButton({
                                    label: 'Поиск по сайту ГДК',
                                    color: 'primary'
                                })
                                .textButton({
                                    label: 'Поиск по группе ВК',
                                    color: 'primary'
                                })
                                .row()
                                .textButton({
                                    label: 'Комбинир. поиск (ВК + сайт)',
                                    color: 'primary'
                                })
                                .textButton({
                                    label: 'Для рабочих',
                                    color: 'primary'
                                })
                                .oneTime();

                            this.searchStates.delete(senderId);
                            return await context.send(
                                `Ответ на ваш вопрос:\n\n${answer.text}`,
                                { keyboard: navigationKeyboard }
                            );
                        }
                    } catch (error) {
                        console.error('Error processing VK question:', error);
                        this.searchStates.delete(senderId);
                        return await context.send('Произошла ошибка при обработке вопроса. Попробуйте позже.');
                    }
                }

                // Handle search query input
                if (this.searchStates.get(senderId) === 'waiting_for_query') {
                    const admin = await this.prisma.admin.findUnique({
                        where: { id: adminPassword }
                    });

                    if (!admin) {
                        this.searchStates.delete(senderId);
                        return await context.send('Ошибка: администратор не найден');
                    }

                    if (text.length > admin.request_max_symbols) {
                        const keyboard = new KeyboardBuilder()
                            .textButton({
                                label: 'Поиск по сайту ГДК',
                                color: 'primary'
                            })
                            .textButton({
                                label: 'Поиск по группе ВК',
                                color: 'primary'
                            })
                            .row()
                            .textButton({
                                label: 'Комбинир. поиск (ВК + сайт)',
                                color: 'primary'
                            })
                            .textButton({
                                label: 'Для рабочих',
                                color: 'primary'
                            })
                            .oneTime();

                        this.searchStates.delete(senderId);
                        return await context.send(
                            `Превышен лимит символов (${admin.request_max_symbols}). Пожалуйста, сократите запрос.`,
                            { keyboard }
                        );
                    }

                    try {
                        // Get embedding directly without compression
                        const queryEmbedding = await this.yandexService.getEmbedding(text);
                        
                        // Get sections data from crawler service
                        const sections = await this.crawlerService.getSectionsData();
                        
                        // Find the most similar section
                        let bestMatch: SectionsDataType | null = null;
                        let bestSimilarity = -1;
                        
                        for (const section of sections) {
                            const similarity = this.cosineSimilarity(queryEmbedding.embedding, section.embedding);
                            if (similarity > bestSimilarity) {
                                bestSimilarity = similarity;
                                bestMatch = section;
                            }
                        }

                        if (bestMatch) {
                            console.log('Best matching section content:', bestMatch.content);
                            // Update database with request count and token usage
                            await this.prisma.admin.update({
                                where: { id: adminPassword },
                                data: {
                                    total_request_amount: { increment: 1 },
                                    total_tokens_emb_amount: { increment: Number(queryEmbedding.tokens) },
                                    requests_data: {
                                        push: {
                                            data: new Date(),
                                            theme: bestMatch.name,
                                            type: "Найти секцию/пост",
                                            token_emb: Number(queryEmbedding.tokens),
                                            token_comp: 0
                                        }
                                    }
                                }
                            });

                            const keyboard = new KeyboardBuilder()
                                .textButton({
                                    label: 'Поиск по сайту ГДК',
                                    color: 'primary'
                                })
                                .textButton({
                                    label: 'Поиск по группе ВК',
                                    color: 'primary'
                                })
                                .row()
                                .textButton({
                                    label: 'Комбинир. поиск (ВК + сайт)',
                                    color: 'primary'
                                })
                                .textButton({
                                    label: 'Для рабочих',
                                    color: 'primary'
                                })
                                .oneTime();

                            this.searchStates.delete(senderId);
                            await context.sendPhotos({value: bestMatch.imageUrl})
                            return await context.send(
                                `Похоже, вам подойдёт раздел "${bestMatch.name}"\nПрямая ссылка на раздел: ${bestMatch.user_url}`,
                                { keyboard, }
                            );
                        }
                    } catch (error) {
                        console.error('Error processing search:', error);
                        this.searchStates.delete(senderId);
                        return await context.send('Произошла ошибка при поиске. Попробуйте позже.');
                    }
                }

                // Handle VK search query input
                if (this.searchStates.get(senderId) === 'waiting_for_vk_query') {
                    try {
                        // Get embedding directly without compression
                        const queryEmbedding = await this.yandexService.getEmbedding(text);
                        
                        // Get posts data from data service
                        const posts = await this.dataService.getPostsData();
                        
                        // Find the most similar post
                        let bestMatch: {name: string, url: string, content: string, embedding: number[]} | null = null;
                        let bestSimilarity = -1;
                        
                        for (const post of posts) {
                            const similarity = this.cosineSimilarity(queryEmbedding.embedding, post.embedding);
                            if (similarity > bestSimilarity) {
                                bestSimilarity = similarity;
                                bestMatch = post;
                            }
                        }

                        if (bestMatch) {
                            console.log('Best matching post content:', bestMatch.content);
                            // Update database with request count and token usage
                            await this.prisma.admin.update({
                                where: { id: adminPassword },
                                data: {
                                    total_request_amount: { increment: 1 },
                                    total_tokens_emb_amount: { increment: Number(queryEmbedding.tokens) },
                                    requests_data: {
                                        push: {
                                            data: new Date(),
                                            theme: "Пост",
                                            type: "Найти секцию/пост",
                                            token_emb: Number(queryEmbedding.tokens),
                                            token_comp: 0
                                        }
                                    }
                                }
                            });

                            const keyboard = new KeyboardBuilder()
                                .textButton({
                                    label: 'Поиск по сайту ГДК',
                                    color: 'primary'
                                })
                                .textButton({
                                    label: 'Поиск по группе ВК',
                                    color: 'primary'
                                })
                                .row()
                                .textButton({
                                    label: 'Комбинир. поиск (ВК + сайт)',
                                    color: 'primary'
                                })
                                .textButton({
                                    label: 'Для рабочих',
                                    color: 'primary'
                                })
                                .oneTime();

                            this.searchStates.delete(senderId);
                            return await context.send(
                                `Найден релевантный пост:\n\n${bestMatch.name}\n\nСодержание:\n${bestMatch.content}\n\nСсылка: ${bestMatch.url}`,
                                { keyboard }
                            );
                        }
                    } catch (error) {
                        console.error('Error processing VK search:', error);
                        this.searchStates.delete(senderId);
                        return await context.send('Произошла ошибка при поиске. Попробуйте позже.');
                    }
                }

                // Handle combined search query input
                if (this.searchStates.get(senderId) === 'waiting_for_combined_query') {
                    const admin = await this.prisma.admin.findUnique({
                        where: { id: adminPassword }
                    });

                    if (!admin) {
                        this.searchStates.delete(senderId);
                        return await context.send('Ошибка: администратор не найден');
                    }

                    if (text.length > admin.request_max_symbols) {
                        const keyboard = new KeyboardBuilder()
                            .textButton({
                                label: 'Поиск по сайту ГДК',
                                color: 'primary'
                            })
                            .textButton({
                                label: 'Поиск по группе ВК',
                                color: 'primary'
                            })
                            .row()
                            .textButton({
                                label: 'Комбинир. поиск (ВК + сайт)',
                                color: 'primary'
                            })
                            .textButton({
                                label: 'Для рабочих',
                                color: 'primary'
                            })
                            .oneTime();

                        this.searchStates.delete(senderId);
                        return await context.send(
                            `Превышен лимит символов (${admin.request_max_symbols}). Пожалуйста, сократите запрос.`,
                            { keyboard }
                        );
                    }

                    try {
                        // Get embedding directly without compression
                        const queryEmbedding = await this.yandexService.getEmbedding(text);
                        
                        // Get both sections and posts data
                        const sections = await this.crawlerService.getSectionsData();
                        const posts = await this.dataService.getPostsData();
                        
                        // Find the most similar section
                        let bestSection: SectionsDataType | null = null;
                        let bestSectionSimilarity = -1;
                        
                        for (const section of sections) {
                            const similarity = this.cosineSimilarity(queryEmbedding.embedding, section.embedding);
                            if (similarity > bestSectionSimilarity) {
                                bestSectionSimilarity = similarity;
                                bestSection = section;
                            }
                        }

                        // Find the most similar post
                        let bestPost: {name: string, url: string, content: string, embedding: number[]} | null = null;
                        let bestPostSimilarity = -1;
                        
                        for (const post of posts) {
                            const similarity = this.cosineSimilarity(queryEmbedding.embedding, post.embedding);
                            if (similarity > bestPostSimilarity) {
                                bestPostSimilarity = similarity;
                                bestPost = post;
                            }
                        }

                        // Update database with request count and token usage
                        await this.prisma.admin.update({
                            where: { id: adminPassword },
                            data: {
                                total_request_amount: { increment: 1 },
                                total_tokens_emb_amount: { increment: Number(queryEmbedding.tokens) },
                                requests_data: {
                                    push: {
                                        data: new Date(),
                                        theme: bestSectionSimilarity > bestPostSimilarity ? bestSection?.name || "Раздел" : "Пост",
                                        type: "Найти секцию/пост",
                                        token_emb: Number(queryEmbedding.tokens),
                                        token_comp: 0
                                    }
                                }
                            }
                        });

                        const keyboard = new KeyboardBuilder()
                            .textButton({
                                label: 'Поиск по сайту ГДК',
                                color: 'primary'
                            })
                            .textButton({
                                label: 'Поиск по группе ВК',
                                color: 'primary'
                            })
                            .row()
                            .textButton({
                                label: 'Комбинир. поиск (ВК + сайт)',
                                color: 'primary'
                            })
                            .textButton({
                                label: 'Для рабочих',
                                color: 'primary'
                            })
                            .oneTime();

                        this.searchStates.delete(senderId);
                        
                        // Compare similarities and show only the best match
                        if (bestSectionSimilarity > bestPostSimilarity) {
                            if (bestSection) {
                                let contentToUse = bestSection.content;
                                console.log('Best matching section content:', contentToUse);
                                
                                // If the closest section is either Мероприятия, События or Новости, include all sections
                                if (bestSection.name === "Мероприятия" || bestSection.name === "События" || bestSection.name === "Новости") {
                                    const sections = await this.crawlerService.getSectionsData();
                                    const meropriyatiya = sections.find(s => s.name === "Мероприятия");
                                    const sobytiya = sections.find(s => s.name === "События");
                                    const novosti = sections.find(s => s.name === "Новости");
                                    
                                    if (meropriyatiya && sobytiya && novosti) {
                                        contentToUse = `${meropriyatiya.content}\n\n${sobytiya.content}\n\n${novosti.content}`;
                                        console.log('Combined Мероприятия, События and Новости content:', contentToUse);
                                    }
                                }

                                const answer = await this.yandexService.getAnswer(text, contentToUse);

                                await context.sendPhotos({value: bestSection.imageUrl});
                                return await context.send(
                                    `Найден релевантный раздел на сайте ГДК:\n\n"${bestSection.name}"\n\nСсылка: ${bestSection.user_url}`,
                                    { keyboard }
                                );
                            }
                        } else {
                            if (bestPost) {
                                console.log('Best matching post content:', bestPost.content);
                                return await context.send(
                                    `Найден релевантный пост в группе ВК:\n\n"${bestPost.name}"\n\nСодержание:\n${bestPost.content}\n\nСсылка: ${bestPost.url}`,
                                    { keyboard }
                                );
                            }
                        }

                        return await context.send('По вашему запросу ничего не найдено.', { keyboard });
                    } catch (error) {
                        console.error('Error processing combined search:', error);
                        this.searchStates.delete(senderId);
                        return await context.send('Произошла ошибка при поиске. Попробуйте позже.');
                    }
                }

                // Handle combined question input
                if (this.searchStates.get(senderId) === 'waiting_for_combined_question') {
                    try {
                        // Get embedding directly without compression
                        const queryEmbedding = await this.yandexService.getEmbedding(text);
                        
                        // Get both sections and posts data
                        const sections = await this.crawlerService.getSectionsData();
                        const posts = await this.dataService.getPostsData();
                        
                        // Find the most similar section
                        let bestSection: SectionsDataType | null = null;
                        let bestSectionSimilarity = -1;
                        
                        for (const section of sections) {
                            const similarity = this.cosineSimilarity(queryEmbedding.embedding, section.embedding);
                            if (similarity > bestSectionSimilarity) {
                                bestSectionSimilarity = similarity;
                                bestSection = section;
                            }
                        }

                        // Find the most similar post
                        let bestPost: {name: string, url: string, content: string, embedding: number[]} | null = null;
                        let bestPostSimilarity = -1;
                        
                        for (const post of posts) {
                            const similarity = this.cosineSimilarity(queryEmbedding.embedding, post.embedding);
                            if (similarity > bestPostSimilarity) {
                                bestPostSimilarity = similarity;
                                bestPost = post;
                            }
                        }

                        const keyboard = new KeyboardBuilder()
                            .textButton({
                                label: 'Поиск по сайту ГДК',
                                color: 'primary'
                            })
                            .textButton({
                                label: 'Поиск по группе ВК',
                                color: 'primary'
                            })
                            .row()
                            .textButton({
                                label: 'Комбинир. поиск (ВК + сайт)',
                                color: 'primary'
                            })
                            .textButton({
                                label: 'Для рабочих',
                                color: 'primary'
                            })
                            .oneTime();

                        this.searchStates.delete(senderId);
                        
                        // Compare similarities and show only the best match
                        if (bestSectionSimilarity > bestPostSimilarity) {
                            if (bestSection) {
                                let contentToUse = bestSection.content;
                                console.log('Best matching section content:', contentToUse);
                                
                                // If the closest section is either Мероприятия, События or Новости, include all sections
                                if (bestSection.name === "Мероприятия" || bestSection.name === "События" || bestSection.name === "Новости") {
                                    const sections = await this.crawlerService.getSectionsData();
                                    const meropriyatiya = sections.find(s => s.name === "Мероприятия");
                                    const sobytiya = sections.find(s => s.name === "События");
                                    const novosti = sections.find(s => s.name === "Новости");
                                    
                                    if (meropriyatiya && sobytiya && novosti) {
                                        contentToUse = `${meropriyatiya.content}\n\n${sobytiya.content}\n\n${novosti.content}`;
                                        console.log('Combined Мероприятия, События and Новости content:', contentToUse);
                                    }
                                }

                                const answer = await this.yandexService.getAnswer(text, contentToUse);
                                
                                // Update database with request count and token usage
                                await this.prisma.admin.update({
                                    where: { id: adminPassword },
                                    data: {
                                        total_request_amount: { increment: 1 },
                                        total_tokens_emb_amount: { increment: Number(queryEmbedding.tokens) },
                                        requests_data: {
                                            push: {
                                                data: new Date(),
                                                theme: bestSection.name,
                                                type: "Ответить на вопрос",
                                                token_emb: Number(queryEmbedding.tokens),
                                                token_comp: 0
                                            }
                                        }
                                    }
                                });

                                return await context.send(
                                    `Ответ на ваш вопрос (на основе раздела сайта ГДК):\n\n${answer.text}`,
                                    { keyboard }
                                );
                            }
                        } else {
                            if (bestPost) {
                                const answer = await this.yandexService.getAnswer(text, bestPost.content);
                                
                                // Update database with request count and token usage
                                await this.prisma.admin.update({
                                    where: { id: adminPassword },
                                    data: {
                                        total_request_amount: { increment: 1 },
                                        total_tokens_emb_amount: { increment: Number(queryEmbedding.tokens) },
                                        requests_data: {
                                            push: {
                                                data: new Date(),
                                                theme: "Пост",
                                                type: "Ответить на вопрос",
                                                token_emb: Number(queryEmbedding.tokens),
                                                token_comp: 0
                                            }
                                        }
                                    }
                                });

                                return await context.send(
                                    `Ответ на ваш вопрос (на основе поста в группе ВК):\n\n${answer.text}`,
                                    { keyboard }
                                );
                            }
                        }

                        return await context.send('По вашему вопросу ничего не найдено.', { keyboard });
                    } catch (error) {
                        console.error('Error processing combined question:', error);
                        this.searchStates.delete(senderId);
                        return await context.send('Произошла ошибка при обработке вопроса. Попробуйте позже.');
                    }
                }

                // Handle random text input (not a button)
                if (!['поиск по сайту гдк', 'поиск по группе вк', 'комбинир. поиск (вк + сайт)', 'для рабочих'].includes(text) && 
                    !this.searchStates.has(senderId) && 
                    !this.authStates.has(senderId) && 
                    !this.workerStates.has(senderId)) {
                    const keyboard = new KeyboardBuilder()
                        .textButton({
                            label: 'Поиск по сайту ГДК',
                            color: 'primary'
                        })
                        .textButton({
                            label: 'Поиск по группе ВК',
                            color: 'primary'
                        })
                        .row()
                        .textButton({
                            label: 'Комбинир. поиск (ВК + сайт)',
                            color: 'primary'
                        })
                        .textButton({
                            label: 'Для рабочих',
                            color: 'primary'
                        })
                        .oneTime();

                    return await context.send(
                        'Пожалуйста, используйте кнопки для навигации.',
                        { keyboard }
                    );
                }

                // Handle "Для рабочих" button
                if (text === 'для рабочих') {
                    this.authStates.set(senderId, 'waiting_for_code');
                    return await context.send('Введите код доступа:');
                }

                // Handle code input
                if (this.authStates.get(senderId) === 'waiting_for_code') {
                    // Check if it's admin code
                    if (text === adminPassword) {
                        const admin = await this.prisma.admin.findUnique({
                            where: { id: adminPassword }
                        });

                        if (!admin) {
                            this.authStates.delete(senderId);
                            const keyboard = new KeyboardBuilder()
                                .textButton({
                                    label: 'Поиск по сайту ГДК',
                                    color: 'primary'
                                })
                                .textButton({
                                    label: 'Поиск по группе ВК',
                                    color: 'primary'
                                })
                                .row()
                                .textButton({
                                    label: 'Комбинир. поиск (ВК + сайт)',
                                    color: 'primary'
                                })
                                .textButton({
                                    label: 'Для рабочих',
                                    color: 'primary'
                                })
                                .oneTime();
                            return await context.send('Ошибка: администратор не найден', { keyboard });
                        }

                        this.authStates.set(senderId, 'authenticated');
                        const keyboard = new KeyboardBuilder()
                            .textButton({
                                label: 'Создать рабочего',
                                color: 'primary'
                            })
                            .textButton({
                                label: 'Сообщения',
                                color: 'primary'
                            })
                            .oneTime();

                        return await context.send(
                            `Добро пожаловать, администратор!\n\n` +
                            `Статистика:\n` +
                        `Всего запросов: ${admin.total_request_amount}\n` +
                        `Цена за токены (сокращения): 0,20 руб за 1000 токенов\n` +
                        `Цена за токены (эмбеддинги): 0,01 руб за 1000 токенов\n` +
                        `Использовано токенов (сокращения): ${admin.total_tokens_comp_amount}\n` +
                        `Использовано токенов (эмбеддинги): ${admin.total_tokens_emb_amount}`,
                            { keyboard }
                        );
                    }

                    // Check if it's worker code
                    const worker = await this.prisma.worker.findUnique({
                        where: { id: text }
                    });

                    if (!worker) {
                        this.authStates.delete(senderId);
                        const keyboard = new KeyboardBuilder()
                            .textButton({
                                label: 'Поиск по сайту ГДК',
                                color: 'primary'
                            })
                            .textButton({
                                label: 'Поиск по группе ВК',
                                color: 'primary'
                            })
                            .row()
                            .textButton({
                                label: 'Комбинир. поиск (ВК + сайт)',
                                color: 'primary'
                            })
                            .textButton({
                                label: 'Для рабочих',
                                color: 'primary'
                            })
                            .oneTime();
                        return await context.send('Неверный код доступа. Попробуйте еще раз или обратитесь к администратору.', { keyboard });
                    }

                    if (!worker.adminId) {
                        this.authStates.delete(senderId);
                        const keyboard = new KeyboardBuilder()
                            .textButton({
                                label: 'Поиск по сайту ГДК',
                                color: 'primary'
                            })
                            .textButton({
                                label: 'Поиск по группе ВК',
                                color: 'primary'
                            })
                            .row()
                            .textButton({
                                label: 'Комбинир. поиск (ВК + сайт)',
                                color: 'primary'
                            })
                            .textButton({
                                label: 'Для рабочих',
                                color: 'primary'
                            })
                            .oneTime();
                        return await context.send('Ошибка: рабочий не привязан к администратору', { keyboard });
                    }

                    const admin = await this.prisma.admin.findUnique({
                        where: { id: worker.adminId }
                    });

                    if (!admin) {
                        return await context.send('Ошибка: администратор не найден');
                    }

                    this.workerStates.set(senderId, worker.id);
                    this.authStates.delete(senderId);

                    const keyboard = new KeyboardBuilder()
                        .textButton({
                            label: 'Написать сообщение',
                            color: 'primary'
                        })
                        .textButton({
                            label: 'Обновить данные',
                            color: 'primary'
                        })
                        .textButton({
                            label: 'Посмотреть запросы',
                            color: 'primary'
                        })
                        .oneTime();

                    return await context.send(
                        `Добро пожаловать, рабочий!\n\n` +
                        `Статистика:\n` +
                        `Всего запросов: ${admin.total_request_amount}\n` +
                        `Цена за токены (сокращения): 0,20 руб за 1000 токенов\n` +
                        `Цена за токены (эмбеддинги): 0,01 руб за 1000 токенов\n` +
                        `Использовано токенов (сокращения): ${admin.total_tokens_comp_amount}\n` +
                        `Использовано токенов (эмбеддинги): ${admin.total_tokens_emb_amount}`,
                        { keyboard }
                    );
                }

                // Handle "Обновить данные" button for workers
                if (text === 'обновить данные' && this.workerStates.has(senderId)) {
                    try {
                        this.crawlerService.updateSectionsData()
                        const adminId = this.configService.getOrThrow<string>('adminPassword');
                        const admin = await this.prisma.admin.findUnique({
                            where: { id: adminId }
                        });

                        const keyboard = new KeyboardBuilder()
                            .textButton({
                                label: 'Написать сообщение',
                                color: 'primary'
                            })
                            .textButton({
                                label: 'Обновить данные',
                                color: 'primary'
                            })
                            .textButton({
                                label: 'Посмотреть запросы',
                                color: 'primary'
                            })
                            .oneTime();
                            if (admin) {
                        return await context.send(
                            `Данные о постах/частях сайта актуализированы:\n\n` +
                            `Всего запросов: ${admin.total_request_amount}\n` +
                            `Цена за токены (сокращения): 0,20 руб за 1000 токенов\n` +
                            `Цена за токены (эмбеддинги): 0,01 руб за 1000 токенов\n` +
                            `Использовано токенов (сокращения): ${admin.total_tokens_comp_amount}\n` +
                            `Использовано токенов (эмбеддинги): ${admin.total_tokens_emb_amount}`,
                            { keyboard }
                        );
                        }
                    } catch (error) {
                        return await context.send('Ошибка при обновлении данных. Попробуйте позже.');
                    }
                }

                // Handle "Создать рабочего" button for admin
                if (text === 'создать рабочего' && this.authStates.get(senderId) === 'authenticated') {
                    try {
                        const worker = await this.workerService.createWorker(adminPassword);
                        const keyboard = new KeyboardBuilder()
                            .textButton({
                                label: 'Создать рабочего',
                                color: 'primary'
                            })
                            .textButton({
                                label: 'Сообщения',
                                color: 'primary'
                            })
                            .textButton({
                                label: 'Обнулить цену',
                                color: 'primary'
                            })
                            .oneTime();

                        return await context.send(`Рабочий создан! ID: ${worker.id}`, { keyboard });
                    } catch (error) {
                        return await context.send('Ошибка при создании рабочего. Попробуйте позже.');
                    }
                }

                // Handle "Обнулить цену" button for admin
                if (text === 'обнулить цену' && this.authStates.get(senderId) === 'authenticated') {
                    try {
                        await this.prisma.admin.update({
                            where: { id: adminPassword },
                            data: {
                                total_tokens_comp_amount: 0,
                                total_tokens_emb_amount: 0
                            }
                        });

                        const admin = await this.prisma.admin.findUnique({
                            where: { id: adminPassword }
                        });

                        const keyboard = new KeyboardBuilder()
                            .textButton({
                                label: 'Создать рабочего',
                                color: 'primary'
                            })
                            .textButton({
                                label: 'Сообщения',
                                color: 'primary'
                            })
                            .textButton({
                                label: 'Обнулить цену',
                                color: 'primary'
                            })
                            .oneTime();
                        if (admin) {
                        return await context.send(
                            `Цены успешно обнулены!\n\n` +
                            `Статистика:\n` +
                            `Всего запросов: ${admin.total_request_amount}\n` +
                            `Цена за токены (сокращения): 0,20 руб за 1000 токенов\n` +
                            `Цена за токены (эмбеддинги): 0,01 руб за 1000 токенов\n` +
                            `Использовано токенов (сокращения): ${admin.total_tokens_comp_amount}\n` +
                            `Использовано токенов (эмбеддинги): ${admin.total_tokens_emb_amount}`,
                            
                            { keyboard }
                        );
                        }
                    } catch (error) {
                        return await context.send('Ошибка при обнулении цен. Попробуйте позже.');
                    }
                }

                // Handle "Сообщения" button for admin
                if (text === 'сообщения' && this.authStates.get(senderId) === 'authenticated') {
                    const messages = await this.prisma.message.findMany({
                        where: {
                            adminId: adminPassword
                        }
                    });

                    if (messages.length === 0) {
                        const keyboard = new KeyboardBuilder()
                            .textButton({
                                label: 'Создать рабочего',
                                color: 'primary'
                            })
                            .textButton({
                                label: 'Сообщения',
                                color: 'primary'
                            })
                            .textButton({
                                label: 'Обнулить цену',
                                color: 'primary'
                            })
                            .oneTime();
                        return await context.send('У вас пока нет сообщений.', { keyboard });
                    }

                    let messageText = 'Ваши сообщения:\n\n';
                    for (const message of messages) {
                        const date = this.formatDate(message.createdAt);
                        messageText += `${date}:\n${message.data}\n`;
                    }

                    // Split long messages if needed
                    if (messageText.length > 4096) {
                        const chunks = this.splitMessage(messageText);
                        for (const chunk of chunks) {
                            await context.send(chunk);
                        }
                    } else {
                        await context.send(messageText);
                    }

                    // Show buttons again after sending messages
                    const keyboard = new KeyboardBuilder()
                        .textButton({
                            label: 'Создать рабочего',
                            color: 'primary'
                        })
                        .textButton({
                            label: 'Сообщения',
                            color: 'primary'
                        })
                        .textButton({
                            label: 'Обнулить цену',
                            color: 'primary'
                        })
                        .oneTime();

                    return await context.send('Выберите действие:', { keyboard });
                }

                // Handle "Написать сообщение" button for workers
                if (text === 'написать сообщение' && this.workerStates.has(senderId)) {
                    this.workerStates.set(senderId, 'waiting_for_message');
                    return await context.send('Введите ваше сообщение:');
                }

                // Handle worker message input
                if (this.workerStates.get(senderId) === 'waiting_for_message') {
                    try {
                        const workerId = this.configService.getOrThrow<string>('workerPassword');
                        // Get the admin ID from the worker's record
                        const worker = await this.prisma.worker.findUnique({
                            where: { id: workerId }
                        });

                        if (!worker || !worker.adminId) {
                            throw new Error('Worker not found or not associated with an admin');
                        }

                        await this.messageService.createMessage(text, worker.adminId, workerId);
                        const currentWorkerId = this.workerStates.get(senderId);
                        if (currentWorkerId) {
                            this.workerStates.set(senderId, currentWorkerId);
                        }

                        const keyboard = new KeyboardBuilder()
                            .textButton({
                                label: 'Написать сообщение',
                                color: 'primary'
                            })
                            .oneTime();

                        return await context.send('Сообщение успешно отправлено!', { keyboard });
                    } catch (error) {
                        console.error('Error sending worker message:', error);
                        const currentWorkerId = this.workerStates.get(senderId);
                        if (currentWorkerId) {
                            this.workerStates.set(senderId, currentWorkerId);
                        }
                        return await context.send('Ошибка при отправке сообщения. Попробуйте позже.');
                    }
                }

                // Handle "Посмотреть запросы" button for workers
                if (text === 'посмотреть запросы' && (this.workerStates.has(senderId) || this.authStates.get(senderId) === 'authenticated')) {
                    try {
                        const adminId = this.configService.getOrThrow<string>('adminPassword');
                        const admin = await this.prisma.admin.findUnique({
                            where: { id: adminId }
                        });

                        if (!admin || !admin.requests_data) {
                            return await context.send('Нет данных о запросах.');
                        }

                        // Create XLSX workbook
                        const workbook = XLSX.utils.book_new();
                        
                        // Format data for Excel
                        const excelData = (admin.requests_data as any[]).map(request => ({
                            'Дата': this.formatDate(new Date(request.data)),
                            'Тема': request.theme,
                            'Тип запроса': request.type,
                            'Токены эмбеддинга': request.token_emb || 0,
                            'Токены для ответа': request.token_comp || 0
                        }));

                        // Create worksheet
                        const worksheet = XLSX.utils.json_to_sheet(excelData);

                        // Add worksheet to workbook
                        XLSX.utils.book_append_sheet(workbook, worksheet, 'Запросы');

                        // Ensure static directory exists
                        const staticDir = path.join(process.cwd(), 'static');
                        if (!fs.existsSync(staticDir)) {
                            fs.mkdirSync(staticDir, { recursive: true });
                        }

                        // Generate unique filename
                        const filename = `requests_${Date.now()}.xlsx`;
                        const filepath = path.join(staticDir, filename);

                        // Write file
                        XLSX.writeFile(workbook, filepath);

                        // Generate file URL
                        const serverUrl = this.configService.get<string>('serverUrl');
                        const fileUrl = `${serverUrl}/static/${filename}`;

                        let messageText = 'История запросов:\n\n';
                        for (const request of admin.requests_data as any[]) {
                            const date = this.formatDate(new Date(request.data));
                            messageText += `${date}\n`;
                            messageText += `Тема: ${request.theme}\n`;
                            messageText += `Тип: ${request.type}\n`;
                            messageText += `Кол-во токенов для ответа эмбеддинга: ${request.token_emb || 0}\n`;
                            messageText += `Кол-во токенов для ответа: ${request.token_comp || 0}\n\n`;
                        }

                        // Split long messages if needed
                        if (messageText.length > 4096) {
                            const chunks = this.splitMessage(messageText);
                            for (const chunk of chunks) {
                                await context.send(chunk);
                            }
                        } else {
                            await context.send(messageText);
                        }

                        // Send Excel file link
                        await context.send(`Скачать Excel файл: ${fileUrl}`);

                        // Show appropriate keyboard based on user type
                        const keyboard = new KeyboardBuilder();
                        if (this.authStates.get(senderId) === 'authenticated') {
                            keyboard
                                .textButton({
                                    label: 'Создать рабочего',
                                    color: 'primary'
                                })
                                .textButton({
                                    label: 'Сообщения',
                                    color: 'primary'
                                })
                                .textButton({
                                    label: 'Обнулить цену',
                                    color: 'primary'
                                });
                        } else {
                            keyboard
                                .textButton({
                                    label: 'Написать сообщение',
                                    color: 'primary'
                                })
                                .textButton({
                                    label: 'Обновить данные',
                                    color: 'primary'
                                })
                                .textButton({
                                    label: 'Посмотреть запросы',
                                    color: 'primary'
                                });
                        }
                        keyboard.oneTime();

                        return await context.send('Выберите действие:', { keyboard });
                    } catch (error) {
                        console.error('Error viewing requests:', error);
                        return await context.send('Ошибка при просмотре запросов. Попробуйте позже.');
                    }
                }

                // Echo other messages
                await context.send(`Вы написали: ${context.text}`);
            } catch (error) {
                console.error('Error sending message:', error);
                try {
                    await context.send('Произошла ошибка при обработке сообщения. Попробуйте позже.');
                } catch (sendError) {
                    console.error('Error sending error message:', sendError);
                }
            }
        });
    }

    async onModuleInit() {
        await this.initializeVkBot();
    }

    formatDate(date: Date) {
        return date.toLocaleString('ru-RU', {
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit'
        });
    }

    private splitMessage(text: string, maxLength: number = 4096): string[] {
        const chunks: string[] = [];
        let currentChunk = '';
        
        const lines = text.split('\n');
        for (const line of lines) {
            if (currentChunk.length + line.length + 1 > maxLength) {
                chunks.push(currentChunk);
                currentChunk = line + '\n';
            } else {
                currentChunk += line + '\n';
            }
        }
        
        if (currentChunk) {
            chunks.push(currentChunk);
        }
        
        return chunks;
      }
}
