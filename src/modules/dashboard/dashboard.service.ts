import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { EventStatus, TransactionStatus } from '@prisma/client';

@Injectable()
export class DashboardService {
  constructor(private prisma: PrismaService) {}

  /**
   * Super Admin dashboard: platform-wide stats
   */
  async getSuperAdminStats() {
    const [
      totalOrgs,
      totalEvents,
      activeEvents,
      pendingApproval,
      totalOperators,
      totalRevenue,
      totalTransactions,
    ] = await Promise.all([
      this.prisma.organization.count(),
      this.prisma.event.count(),
      this.prisma.event.count({ where: { status: EventStatus.ACTIVE } }),
      this.prisma.event.count({
        where: { status: EventStatus.PENDING_APPROVAL },
      }),
      this.prisma.pOSOperator.count(),
      this.prisma.transaction.aggregate({
        where: { status: TransactionStatus.COMPLETED },
        _sum: { totalAmount: true },
      }),
      this.prisma.transaction.count({
        where: { status: TransactionStatus.COMPLETED },
      }),
    ]);

    return {
      totalOrganizations: totalOrgs,
      totalEvents,
      activeEvents,
      pendingApproval,
      totalOperators,
      totalRevenue: totalRevenue._sum.totalAmount || 0,
      totalTransactions,
    };
  }

  /**
   * Organization dashboard: org-specific stats
   */
  async getOrgStats(organizationId: string) {
    const [totalEvents, activeEvents, revenue, transactions] =
      await Promise.all([
        this.prisma.event.count({ where: { organizationId } }),
        this.prisma.event.count({
          where: { organizationId, status: EventStatus.ACTIVE },
        }),
        this.prisma.transaction.aggregate({
          where: {
            event: { organizationId },
            status: TransactionStatus.COMPLETED,
          },
          _sum: { totalAmount: true },
        }),
        this.prisma.transaction.count({
          where: {
            event: { organizationId },
            status: TransactionStatus.COMPLETED,
          },
        }),
      ]);

    return {
      totalEvents,
      activeEvents,
      totalRevenue: revenue._sum.totalAmount || 0,
      totalTransactions: transactions,
    };
  }

  /**
   * Event-level stats
   */
  async getEventStats(eventId: string) {
    const [event, revenue, transactionCount, ticketsSold] = await Promise.all([
      this.prisma.event.findUnique({
        where: { id: eventId },
        include: {
          ticketCategories: {
            select: {
              id: true,
              name: true,
              price: true,
              totalQuantity: true,
              soldQuantity: true,
            },
          },
        },
      }),
      this.prisma.transaction.aggregate({
        where: { eventId, status: TransactionStatus.COMPLETED },
        _sum: { totalAmount: true },
      }),
      this.prisma.transaction.count({
        where: { eventId, status: TransactionStatus.COMPLETED },
      }),
      this.prisma.ticket.count({ where: { ticketCategory: { eventId } } }),
    ]);

    return {
      event: event
        ? {
            id: event.id,
            title: event.title,
            status: event.status,
            startDate: event.startDate,
            endDate: event.endDate,
          }
        : null,
      totalRevenue: revenue._sum.totalAmount || 0,
      totalTransactions: transactionCount,
      totalTicketsSold: ticketsSold,
      ticketCategories: event?.ticketCategories || [],
    };
  }
}
