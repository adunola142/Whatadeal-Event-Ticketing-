import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { EventStatus, UserRole } from '@prisma/client';

@Injectable()
export class EventsService {
  constructor(private prisma: PrismaService) {}

  async create(
    data: {
      title: string;
      description?: string;
      venue: string;
      address?: string;
      city?: string;
      state?: string;
      country?: string;
      startDate: string;
      endDate: string;
      maxCapacity?: number;
      isPublic?: boolean;
      bannerImage?: string;
    },
    organizationId: string,
  ) {
    const slug = this.generateSlug(data.title);

    return this.prisma.event.create({
      data: {
        organizationId,
        title: data.title,
        slug,
        description: data.description,
        venue: data.venue,
        address: data.address,
        city: data.city,
        state: data.state,
        country: data.country || 'Nigeria',
        startDate: new Date(data.startDate),
        endDate: new Date(data.endDate),
        maxCapacity: data.maxCapacity,
        isPublic: data.isPublic ?? true,
        bannerImage: data.bannerImage,
        status: EventStatus.DRAFT,
      },
    });
  }

  async findAll(query: {
    page?: number;
    limit?: number;
    status?: EventStatus;
    organizationId?: string;
    search?: string;
  }) {
    const page = query.page || 1;
    const limit = query.limit || 20;
    const skip = (page - 1) * limit;

    const where: any = {};
    if (query.status) where.status = query.status;
    if (query.organizationId) where.organizationId = query.organizationId;
    if (query.search) {
      where.OR = [
        { title: { contains: query.search, mode: 'insensitive' } },
        { venue: { contains: query.search, mode: 'insensitive' } },
      ];
    }

    const [events, total] = await Promise.all([
      this.prisma.event.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          organization: { select: { id: true, name: true } },
          _count: { select: { ticketCategories: true, transactions: true } },
        },
      }),
      this.prisma.event.count({ where }),
    ]);

    return {
      data: events,
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }

  async findOne(id: string) {
    const event = await this.prisma.event.findUnique({
      where: { id },
      include: {
        organization: { select: { id: true, name: true } },
        ticketCategories: { orderBy: { sortOrder: 'asc' } },
        _count: { select: { transactions: true, eventAssignments: true } },
      },
    });
    if (!event) throw new NotFoundException('Event not found');
    return event;
  }

  async update(
    id: string,
    data: {
      title?: string;
      description?: string;
      venue?: string;
      address?: string;
      city?: string;
      state?: string;
      startDate?: string;
      endDate?: string;
      maxCapacity?: number;
      isPublic?: boolean;
      bannerImage?: string;
    },
    userId: string,
    userRole: UserRole,
  ) {
    const event = await this.findOne(id);

    // Only draft or rejected events can be edited
    if (
      !([EventStatus.DRAFT, EventStatus.REJECTED] as EventStatus[]).includes(event.status)
    ) {
      throw new BadRequestException(
        'Only draft or rejected events can be edited',
      );
    }

    // Check permissions: super admin or org member
    if (userRole !== UserRole.SUPER_ADMIN) {
      await this.verifyOrgMembership(userId, event.organizationId);
    }

    const updateData: any = { ...data };
    if (data.startDate) updateData.startDate = new Date(data.startDate);
    if (data.endDate) updateData.endDate = new Date(data.endDate);

    return this.prisma.event.update({
      where: { id },
      data: updateData,
    });
  }

  /**
   * Organization submits event for Whatadeal approval
   */
  async submitForApproval(id: string, userId: string, userRole: UserRole) {
    const event = await this.findOne(id);

    if (
      !([EventStatus.DRAFT, EventStatus.REJECTED] as EventStatus[]).includes(event.status)
    ) {
      throw new BadRequestException(
        'Only draft or rejected events can be submitted for approval',
      );
    }

    // Verify user is part of the organization
    if (userRole !== UserRole.SUPER_ADMIN) {
      await this.verifyOrgMembership(userId, event.organizationId);
    }

    // Validate event has ticket categories
    if (event.ticketCategories.length === 0) {
      throw new BadRequestException(
        'Event must have at least one ticket category before submission',
      );
    }

    return this.prisma.event.update({
      where: { id },
      data: {
        status: EventStatus.PENDING_APPROVAL,
        submittedAt: new Date(),
        rejectionReason: null, // Clear previous rejection reason
      },
    });
  }

  /**
   * Whatadeal (super admin) approves an event
   */
  async approve(id: string, approvedById: string) {
    const event = await this.findOne(id);

    if (event.status !== EventStatus.PENDING_APPROVAL) {
      throw new BadRequestException('Only pending events can be approved');
    }

    return this.prisma.event.update({
      where: { id },
      data: {
        status: EventStatus.APPROVED,
        approvedById,
        approvedAt: new Date(),
      },
    });
  }

  /**
   * Whatadeal (super admin) rejects an event
   */
  async reject(id: string, reason: string) {
    const event = await this.findOne(id);

    if (event.status !== EventStatus.PENDING_APPROVAL) {
      throw new BadRequestException('Only pending events can be rejected');
    }

    return this.prisma.event.update({
      where: { id },
      data: {
        status: EventStatus.REJECTED,
        rejectionReason: reason,
      },
    });
  }

  /**
   * Publish an approved event (makes it visible on POS)
   */
  async publish(id: string, userId: string, userRole: UserRole) {
    const event = await this.findOne(id);

    if (event.status !== EventStatus.APPROVED) {
      throw new BadRequestException('Only approved events can be published');
    }

    return this.prisma.event.update({
      where: { id },
      data: { status: EventStatus.PUBLISHED },
    });
  }

  /**
   * Activate an event (sales can begin)
   */
  async activate(id: string) {
    const event = await this.findOne(id);

    if (
      !([EventStatus.PUBLISHED, EventStatus.SCHEDULED] as EventStatus[]).includes(event.status)
    ) {
      throw new BadRequestException(
        'Only published or scheduled events can be activated',
      );
    }

    return this.prisma.event.update({
      where: { id },
      data: { status: EventStatus.ACTIVE },
    });
  }

  /**
   * Complete an event
   */
  async complete(id: string) {
    const event = await this.findOne(id);

    if (event.status !== EventStatus.ACTIVE) {
      throw new BadRequestException('Only active events can be completed');
    }

    return this.prisma.event.update({
      where: { id },
      data: { status: EventStatus.COMPLETED },
    });
  }

  /**
   * Cancel an event
   */
  async cancel(id: string) {
    const event = await this.findOne(id);

    if (([EventStatus.COMPLETED, EventStatus.CANCELLED] as EventStatus[]).includes(event.status)) {
      throw new BadRequestException('Event cannot be cancelled');
    }

    return this.prisma.event.update({
      where: { id },
      data: { status: EventStatus.CANCELLED },
    });
  }

  /**
   * Check if event is eligible for ticket sales.
   * Called on EVERY sale attempt — not just cron-based.
   */
  isEligibleForSales(event: {
    status: EventStatus;
    startDate: Date;
    endDate: Date;
  }): { eligible: boolean; reason?: string } {
    if (event.status !== EventStatus.ACTIVE) {
      return { eligible: false, reason: `Event status is ${event.status}, must be ACTIVE` };
    }

    const now = new Date();
    if (now > event.endDate) {
      return { eligible: false, reason: 'Event has ended' };
    }

    return { eligible: true };
  }

  private async verifyOrgMembership(userId: string, organizationId: string) {
    const member = await this.prisma.organizationMember.findUnique({
      where: {
        userId_organizationId: { userId, organizationId },
      },
    });
    if (!member || !member.isActive) {
      throw new ForbiddenException('Not a member of this organization');
    }
    return member;
  }

  private generateSlug(title: string): string {
    const base = title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');
    const suffix = Date.now().toString(36).slice(-4);
    return `${base}-${suffix}`;
  }
}
