import { ForbiddenException, Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import {
  EventStatus,
  TicketStatus,
  TransactionStatus,
  UserRole,
} from '@prisma/client';
import {
  AccessScope,
  isPlatformAdmin,
  requireEventAccess,
  userOrganizationIds,
} from '../../common/utils/organization-scope';

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
      failedTransactions,
      ticketsSold,
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
      this.prisma.transaction.count({
        where: { status: TransactionStatus.FAILED },
      }),
      // Platform-wide tickets sold: valid/used tickets whose transaction
      // actually completed. Mirrors getOrgStats' per-organization query
      // below, just without the organizationId filter.
      this.prisma.ticket.count({
        where: {
          status: { in: [TicketStatus.VALID, TicketStatus.USED] },
          transaction: { status: TransactionStatus.COMPLETED },
        },
      }),
    ]);

    // Success rate = completed / (completed + failed), matching the admin
    // dashboard's own definition (lib/analytics.ts' summarize()) so the two
    // never disagree. Pending/processing transactions haven't resolved yet
    // and are excluded, same as there.
    const attempts = totalTransactions + failedTransactions;

    return {
      totalOrganizations: totalOrgs,
      totalEvents,
      activeEvents,
      pendingApproval,
      totalOperators,
      totalRevenue: totalRevenue._sum.totalAmount || 0,
      totalTransactions,
      failedTransactions,
      totalTicketsSold: ticketsSold,
      paymentSuccessRate: attempts ? (totalTransactions / attempts) * 100 : 0,
    };
  }

  /**
   * Organization dashboard: org-specific stats
   */
  async getOrgStats(organizationId: string, userId: string, role: UserRole) {
    if (!isPlatformAdmin(role)) {
      const ids = await userOrganizationIds(this.prisma, userId);
      if (!ids.includes(organizationId)) {
        throw new ForbiddenException('Not a member of this organization');
      }
    }

    const [
      totalEvents,
      activeEvents,
      pendingApproval,
      revenue,
      transactions,
      ticketsSold,
    ] = await Promise.all([
        this.prisma.event.count({ where: { organizationId } }),
        this.prisma.event.count({
          where: { organizationId, status: EventStatus.ACTIVE },
        }),
        this.prisma.event.count({
          where: { organizationId, status: EventStatus.PENDING_APPROVAL },
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
        this.prisma.ticket.count({
          where: {
            ticketCategory: { event: { organizationId } },
            status: { in: [TicketStatus.VALID, TicketStatus.USED] },
            transaction: { status: TransactionStatus.COMPLETED },
          },
        }),
      ]);

    return {
      totalEvents,
      activeEvents,
      pendingApproval,
      totalRevenue: revenue._sum.totalAmount || 0,
      totalTransactions: transactions,
      totalTicketsSold: ticketsSold,
    };
  }

  /**
   * Event-level stats
   */
  async getEventStats(eventId: string, scope?: AccessScope) {
    if (scope) await requireEventAccess(this.prisma, scope, eventId);
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
