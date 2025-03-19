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

@Injectable()
export class VkService implements OnModuleInit {
    private vk: VK;
    private readonly authStates = new Map<number, string>();
    private readonly workerStates = new Map<number, string>();
    private readonly searchStates = new Map<number, string>();

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
            const groupId = 229780318

            if (!token) {
                throw new Error('VK_TOKEN is not set in environment variables');
            }

            if (!groupId) {
                throw new Error('VK_GROUP_ID is not set in environment variables');
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

    private setupMessageHandlers() {
        this.vk.updates.on('message_new', async (context) => {
            try {
                const text = context.text?.toLowerCase() || '';
                const senderId = context.senderId;
                const adminPassword = this.configService.getOrThrow<string>('adminPassword');

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
                    this.searchStates.set(senderId, 'waiting_for_query');
                    return await context.send('Введите ваш поисковый запрос:');
                }

                // Handle "Поиск по группе ВК" button
                if (text === 'поиск по группе вк') {
                    this.searchStates.set(senderId, 'waiting_for_vk_query');
                    return await context.send('Введите ваш поисковый запрос:');
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
                        // Get compressed text from Yandex
                        const compressedResult = await this.yandexService.getComp(text);
                        const compressedText = compressedResult.text;
                        console.log(compressedText);
                        
                        // Get embedding for the compressed text
                        const queryEmbedding = await this.yandexService.getEmbedding(compressedText);
                        
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
                        // Get compressed text from Yandex
                        const compressedResult = await this.yandexService.getComp(text);
                        const compressedText = compressedResult.text;
                        
                        // Get embedding for the compressed text
                        const queryEmbedding = await this.yandexService.getEmbedding(compressedText);
                        
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

                // Handle random text input (not a button)
                if (!['поиск по сайту гдк', 'поиск по группе вк', 'комбинир. поиск (вк + сайт)', 'для рабочих'].includes(text) && !this.searchStates.has(senderId)) {
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
                            .oneTime();
                            if (admin) {
                        return await context.send(
                            `Статистика обновлена:\n\n` +
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
                    const workerId = this.configService.getOrThrow<string>('workerPassword');
                    try {
                        await this.messageService.createMessage(text, adminPassword, workerId);
                        this.workerStates.delete(senderId);

                        // Show "Написать сообщение" button again
                        const keyboard = new KeyboardBuilder()
                            .textButton({
                                label: 'Написать сообщение',
                                color: 'primary'
                            })
                            .oneTime();

                        return await context.send('Сообщение успешно отправлено!', { keyboard });
                    } catch (error) {
                        this.workerStates.delete(senderId);
                        return await context.send('Ошибка при отправке сообщения. Попробуйте позже.');
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
          const day = String(date.getDate()).padStart(2, '0');
          const month = String(date.getMonth() + 1).padStart(2, '0'); // Месяцы начинаются с 0
          const year = date.getFullYear();
          const hours = String(date.getHours()).padStart(2, '0');
          const minutes = String(date.getMinutes()).padStart(2, '0');
      
          return `${day}.${month}.${year} ${minutes}:${hours}`;
      }

    private splitMessage(text: string, maxLength: number = 4096): string[] {
        const chunks: string[] = [];
        let currentChunk = '';

        const sentences = text.split(/(?<=[.!?])\s+/);
        
        for (const sentence of sentences) {
            if ((currentChunk + sentence).length > maxLength) {
                if (currentChunk) {
                    chunks.push(currentChunk.trim());
                }
                currentChunk = sentence;
            } else {
                currentChunk += (currentChunk ? ' ' : '') + sentence;
            }
        }

        if (currentChunk) {
            chunks.push(currentChunk.trim());
        }

        return chunks;
      }
}
