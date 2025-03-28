import { Injectable, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from 'src/prisma.service';
import { Prisma } from '@prisma/client';

@Injectable()
export class AdminService implements OnModuleInit {
    constructor(
        private readonly prisma: PrismaService,
        private readonly configService: ConfigService
    ) {}

    async onModuleInit() {
        await this.createInitialAdmin();
    }

    async getAdmin(id: string) {
        return await this.prisma.admin.findUnique({
            where: { id }
        });
    }

    async updateAdmin(id: string, data: Prisma.AdminUpdateInput) {
        try {
            const admin = await this.prisma.admin.update({
                where: { id },
                data
            });
            return admin;
        } catch (error) {
            throw new Error(`Failed to update admin: ${error.message}`);
        }
    }

    private async createInitialAdmin() {
        const adminPassword = this.configService.getOrThrow<string>('adminPassword');
        
        try {
            await this.prisma.admin.upsert({
                where: { id: adminPassword },
                update: {},
                create: {
                    id: adminPassword,
                    requests_data: [],
                    request_max_symbols: 110,
                    total_request_amount: 0,
                    total_tokens_comp_amount: 0,
                    total_tokens_emb_amount: 0
                }
            });
            await this.prisma.worker.upsert({
                where: { id: this.configService.getOrThrow<string>('workerPassword') },
                update: {},
                create: {
                    id: this.configService.getOrThrow<string>('workerPassword'),
                    adminId: adminPassword
                }
            });
        } catch (error) {
            console.error('Failed to create initial admin:', error);
        }
    }
}
