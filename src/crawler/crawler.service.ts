import { HttpException, HttpStatus, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron, CronExpression, Interval } from '@nestjs/schedule';
import { SECTIONS } from 'src/config/sections';
import { DataService } from 'src/data/data.service';
import { SectionsDataType } from 'src/data/dto/sections.dto';
import { ParserService } from 'src/parser/parser.service';
import { YandexService } from 'src/yandex/yandex.service';
import { AdminService } from 'src/admin/admin.service';

@Injectable()
export class CrawlerService {
    private readonly logger = new Logger(CrawlerService.name)
    private sectionsData: SectionsDataType[] = [];

    constructor(
        private readonly parserService: ParserService,
        private readonly dataService: DataService,
        private readonly yandexService: YandexService,
        private readonly adminService: AdminService,
        private readonly configService: ConfigService,
    ) {}

    async onModuleInit() {
        await this.updateSectionsData();
    }

    @Interval(24 * 60 * 60 * 1000)
    async handleCron() {
        this.logger.debug('Called when the day passes');
        await this.updateSectionsData();
    }

    async updateSectionsData() {
        const sections = SECTIONS;
        try {
            let totalEmbeddingTokens = 0;
            const previousData = [...this.sectionsData]; // Store previous data for comparison

            this.sectionsData = await Promise.all(
                sections.map(async (section, index) => {
                    const content = await this.parserService.parseSection(section.url, section.parserFunction);
                    
                    // Check if content has changed
                    const previousSection = previousData[index];
                    let embedding;
                    let tokens = 0;

                    if (previousSection && previousSection.content === content) {
                        // Content hasn't changed, reuse previous embedding
                        embedding = previousSection.embedding;
                        this.logger.debug(`Content for section ${section.name} hasn't changed, reusing previous embedding`);
                    } else {
                        // Content has changed, create new embedding
                        const embeddingResult = await this.yandexService.getEmbedding(section.name + ' ' + section.description + ' ' + content);
                        console.log(section.name)
                        console.log(embeddingResult.tokens)
                        embedding = embeddingResult.embedding;
                        tokens = parseInt(embeddingResult.tokens?.toString() || '0');
                        totalEmbeddingTokens += tokens;
                        this.logger.debug(`Content for section ${section.name} has changed, created new embedding`);
                    }

                    return {
                        name: section.name,
                        url: section.url,
                        imageUrl: section.imageUrl,
                        description: section.description,
                        content: content,
                        embedding: embedding,
                        user_url: section.user_url
                    }
                })
            );

            // Only update data service and admin tokens if we created any new embeddings
            if (totalEmbeddingTokens > 0) {
                this.dataService.setSectionsData(this.sectionsData);

                // Update admin's embedding tokens
                const adminPassword = process.env.ADMIN_PASSWORD as string;
                await this.adminService.updateAdmin(adminPassword, {
                    total_tokens_emb_amount: {
                        increment: totalEmbeddingTokens
                    }
                });

                this.logger.debug(`Updated ${totalEmbeddingTokens} embedding tokens for admin`);
            } else {
                this.logger.debug('No content changes detected, skipping database updates');
            }

            // Parse and process VK posts
            const groupId = this.configService.getOrThrow<string>('VK_GROUP_ID');
            const postsText = await this.parserService.parsePosts(groupId);
            const posts = postsText.split('\n\n').map(post => {
                const [title, ...contentParts] = post.split('\n');
                const content = contentParts.join('\n');
                return {
                    name: title.replace('Пост: ', ''),
                    url: '', // VK posts don't have direct URLs
                    content: content.replace('Фото: ', ''),
                    embedding: [] // Will be filled in the next step
                };
            });

            // Get embeddings for posts
            const postsWithEmbeddings = await Promise.all(posts.map(async (post) => {
                const embedding = await this.yandexService.getEmbedding(post.name + ' ' + post.content);
                return {
                    ...post,
                    embedding: embedding.embedding
                };
            }));

            this.dataService.setPostsData(postsWithEmbeddings);

            this.logger.debug('Sections data updated successfully');
        } catch (error) {
            this.logger.error(`Failed to update sections data: ${error.message}`);
            throw new HttpException('Error updating sections data', HttpStatus.INTERNAL_SERVER_ERROR);
        }
    }

    getSectionsData(): SectionsDataType[] {
        return this.sectionsData;
    }
}
