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
                        console.log(`Section "${section.name}" tokens: ${embeddingResult.tokens}`);
                        console.log(content)
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

            console.log(`Total tokens for sections: ${totalEmbeddingTokens}`);

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
            const groupNumber = this.configService.getOrThrow<string>('VK_GROUP_NUMBER');
            const postsText = await this.parserService.parsePosts(groupId, groupNumber);
            const previousPosts = this.dataService.getPostsData();
            
            const posts = postsText.split('\n').map(post => {
                try {
                    const [content, idPart, urlPart] = post.split(' | ');
                    if (!content || !idPart || !urlPart) {
                        console.error('Invalid post format:', post);
                        return null;
                    }

                    const id = parseInt(idPart.replace('ID: ', ''));
                    if (isNaN(id)) {
                        console.error('Invalid post ID:', idPart);
                        return null;
                    }

                    const url = urlPart.replace('URL: ', '');
                    const text = content.replace('Пост: ', '');
                    
                    // Check if post already exists
                    const existingPost = previousPosts.find(p => p.id === id);
                    
                    return {
                        id,
                        name: text.substring(0, 100) + (text.length > 100 ? '...' : ''), // Use first 100 chars as name
                        url,
                        content: text,
                        embedding: existingPost?.embedding || [] // Reuse existing embedding if available
                    };
                } catch (error) {
                    console.error('Error parsing post:', post, error);
                    return null;
                }
            }).filter((post): post is NonNullable<typeof post> => post !== null);

            // Get embeddings only for new posts
            totalEmbeddingTokens = 0;
            const postsWithEmbeddings = await Promise.all(posts.map(async (post) => {
                if (post.embedding.length === 0) {
                    const embedding = await this.yandexService.getEmbedding(post.name + ' ' + post.content);
                    console.log(`Post "${post.name}" tokens: ${embedding.tokens}`);
                    console.log(post.content)
                    totalEmbeddingTokens += Number(embedding.tokens);
                    return {
                        ...post,
                        embedding: embedding.embedding
                    };
                }
                return post;
            }));

            console.log(`Total tokens for posts: ${totalEmbeddingTokens}`);

            this.dataService.setPostsData(postsWithEmbeddings);

            // Update admin's embedding tokens for both sections and posts
            if (totalEmbeddingTokens > 0) {
                const adminPassword = this.configService.getOrThrow<string>('adminPassword');
                await this.adminService.updateAdmin(adminPassword, {
                    total_tokens_emb_amount: {
                        increment: totalEmbeddingTokens
                    }
                });

                this.logger.debug(`Updated ${totalEmbeddingTokens} embedding tokens for admin (sections and posts)`);
            }

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
