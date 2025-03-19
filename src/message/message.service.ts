import { Injectable } from '@nestjs/common';
import { PrismaService } from 'src/prisma.service';
import { Prisma } from '@prisma/client';

@Injectable()
export class MessageService {
    constructor(
        private readonly prisma: PrismaService
    ) {}

    async createMessage(data: string, adminId?: string, workerId?: string) {
        console.log('wowlk')
        console.log(workerId)
        console.log(adminId)
        try {
            const message = await this.prisma.message.create({
                data: {
                    data,
                    adminId,
                    workerId
                }
            });
            return message;
        } catch (error) {
            throw new Error(`Failed to create message: ${error.message}`);
        }
    }
}
