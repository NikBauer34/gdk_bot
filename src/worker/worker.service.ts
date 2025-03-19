import { Injectable } from '@nestjs/common';
import { PrismaService } from 'src/prisma.service';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class WorkerService {
    constructor(
        private readonly prisma: PrismaService,
        private readonly configService: ConfigService
    ) {}

    async createWorker(adminId: string) {
        try {
            const worker = await this.prisma.worker.create({
                data: {
                    adminId
                }
            });
            return worker;
        } catch (error) {
            throw new Error(`Failed to create worker: ${error.message}`);
        }
    }
}
