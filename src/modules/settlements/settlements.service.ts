import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { SettlementStatus, TransactionStatus } from '@prisma/client';
import { v4 as uuidv4 } from 'uuid';

@Injectable()
export class SettlementsService {
  constructor(private prisma: PrismaService) {}

  async create(data: {
    organizationId: string;
    eventId?: string;
    platformFeePercent: number;
    periodStart: string;
    periodEnd: string;
  }) {
    // Verify org exists
    const org = await this.prisma.organization.findUnique({
      where: { id: data.organizationId },
    });
    if (!org) throw new NotFoundException('Organization not found');

    // Calculate total from completed transactions in period
    const where: any = {
      event: { organizationId: data.organizationId },
      status: TransactionStatus.COMPLETED,
      completedAt: {
        gte: new Date(data.periodStart),
        lte: new Date(data.periodEnd),
      },
    };
    if (data.eventId) where.eventId = data.eventId;

    const totals = await this.prisma.transaction.aggregate({
      where,
      _sum: { totalAmount: true },
    });

    const totalAmount = Number(totals._sum.totalAmount || 0);
    const platformFee = Math.round(totalAmount * (data.platformFeePercent / 100) * 100) / 100;
    const netAmount = totalAmount - platformFee;

    const settlementRef = `STL-${Date.now().toString(36).toUpperCase()}-${uuidv4().slice(0, 4).toUpperCase()}`;

    return this.prisma.settlement.create({
      data: {
        organizationId: data.organizationId,
        eventId: data.eventId,
        totalAmount,
        platformFee,
        netAmount,
        settlementRef,
        periodStart: new Date(data.periodStart),
        periodEnd: new Date(data.periodEnd),
      },
    });
  }

  async findAll(query: {
    page?: number;
    limit?: number;
    organizationId?: string;
    status?: SettlementStatus;
  }) {
    const page = query.page || 1;
    const limit = query.limit || 20;
    const skip = (page - 1) * limit;

    const where: any = {};
    if (query.organizationId) where.organizationId = query.organizationId;
    if (query.status) where.status = query.status;

    const [settlements, total] = await Promise.all([
      this.prisma.settlement.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.settlement.count({ where }),
    ]);

    return {
      data: settlements,
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }

  async findOne(id: string) {
    const settlement = await this.prisma.settlement.findUnique({
      where: { id },
    });
    if (!settlement) throw new NotFoundException('Settlement not found');
    return settlement;
  }

  async updateStatus(id: string, status: SettlementStatus) {
    const settlement = await this.findOne(id);

    if (settlement.status === SettlementStatus.COMPLETED) {
      throw new BadRequestException('Completed settlements cannot be modified');
    }

    const updateData: any = { status };
    if (status === SettlementStatus.COMPLETED) {
      updateData.processedAt = new Date();
    }

    return this.prisma.settlement.update({
      where: { id },
      data: updateData,
    });
  }
}
