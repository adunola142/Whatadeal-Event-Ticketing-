import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { EventStatus } from '@prisma/client';
import {
  AccessScope,
  requireEventAccess,
  requireOrgAccess,
} from '../../common/utils/organization-scope';

@Injectable()
export class TicketCategoriesService {
  constructor(private prisma: PrismaService) {}

  async create(data: {
    eventId: string;
    name: string;
    description?: string;
    price: number;
    totalQuantity: number;
    maxPerTransaction?: number;
    sortOrder?: number;
    salesStartDate?: string;
    salesEndDate?: string;
  }, scope?: AccessScope) {
    // Verify event exists and is in editable state
    const event = await this.prisma.event.findUnique({
      where: { id: data.eventId },
    });
    if (!event) throw new NotFoundException('Event not found');
    if (scope) await requireOrgAccess(this.prisma, scope, event.organizationId);

    if (
      !([
        EventStatus.DRAFT,
        EventStatus.REJECTED,
        EventStatus.APPROVED,
        EventStatus.PENDING_APPROVAL,
      ] as EventStatus[]).includes(event.status)
    ) {
      throw new BadRequestException(
        'Cannot add ticket categories to events in current status',
      );
    }

    return this.prisma.ticketCategory.create({
      data: {
        eventId: data.eventId,
        name: data.name,
        description: data.description,
        price: data.price,
        totalQuantity: data.totalQuantity,
        maxPerTransaction: data.maxPerTransaction || 10,
        sortOrder: data.sortOrder || 0,
        salesStartDate: data.salesStartDate
          ? new Date(data.salesStartDate)
          : undefined,
        salesEndDate: data.salesEndDate
          ? new Date(data.salesEndDate)
          : undefined,
      },
    });
  }

  async findByEvent(eventId: string, scope?: AccessScope) {
    if (scope) await requireEventAccess(this.prisma, scope, eventId, { allowAssignedOperator: true });
    return this.prisma.ticketCategory.findMany({
      where: { eventId },
      orderBy: { sortOrder: 'asc' },
    });
  }

  async findOne(id: string, scope?: AccessScope) {
    const category = await this.prisma.ticketCategory.findUnique({
      where: { id },
      include: { event: { select: { id: true, title: true, status: true } } },
    });
    if (!category) throw new NotFoundException('Ticket category not found');
    if (scope) await requireEventAccess(this.prisma, scope, category.eventId, { allowAssignedOperator: true });
    return category;
  }

  async update(
    id: string,
    data: {
      name?: string;
      description?: string;
      price?: number;
      totalQuantity?: number;
      maxPerTransaction?: number;
      sortOrder?: number;
      isActive?: boolean;
    },
    scope?: AccessScope,
  ) {
    const category = await this.findOne(id);
    if (scope) await requireEventAccess(this.prisma, scope, category.eventId);

    // Cannot reduce totalQuantity below soldQuantity
    if (
      data.totalQuantity !== undefined &&
      data.totalQuantity < category.soldQuantity
    ) {
      throw new BadRequestException(
        `Cannot set total quantity below sold quantity (${category.soldQuantity})`,
      );
    }

    return this.prisma.ticketCategory.update({
      where: { id },
      data,
    });
  }

  /**
   * Get available quantity for a ticket category.
   * available = totalQuantity - soldQuantity - reservedQuantity
   */
  getAvailableQuantity(category: {
    totalQuantity: number;
    soldQuantity: number;
    reservedQuantity: number;
  }): number {
    return (
      category.totalQuantity -
      category.soldQuantity -
      category.reservedQuantity
    );
  }

  /**
   * Delete a ticket category.
   * Only allowed if no tickets have been sold.
   */
  async delete(id: string, scope?: AccessScope) {
    const category = await this.findOne(id);
    if (scope) await requireEventAccess(this.prisma, scope, category.eventId);

    if (category.soldQuantity > 0) {
      throw new BadRequestException(
        `Cannot delete category with ${category.soldQuantity} tickets sold. Deactivate it instead.`,
      );
    }

    await this.prisma.ticketCategory.delete({ where: { id } });

    return { message: 'Ticket category deleted successfully' };
  }
}
