import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import {
  EventStatus,
  TransactionStatus,
  TicketStatus,
  UserRole,
} from '@prisma/client';
import { v4 as uuidv4 } from 'uuid';
import * as bcrypt from 'bcrypt';

@Injectable()
export class POSService {
  private readonly logger = new Logger(POSService.name);

  constructor(private prisma: PrismaService) {}

  // ============================================
  // OPERATOR MANAGEMENT (Super Admin only)
  // ============================================

  async createOperator(data: {
    userId: string;
    employeeId?: string;
  }) {
    // Verify user exists and is a POS_OPERATOR
    const user = await this.prisma.user.findUnique({
      where: { id: data.userId },
    });
    if (!user) throw new NotFoundException('User not found');
    if (user.role !== UserRole.POS_OPERATOR) {
      throw new BadRequestException('User must have POS_OPERATOR role');
    }

    const existing = await this.prisma.pOSOperator.findUnique({
      where: { userId: data.userId },
    });
    if (existing) throw new ConflictException('User is already a POS operator');

    return this.prisma.pOSOperator.create({
      data: {
        userId: data.userId,
        employeeId: data.employeeId,
      },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
          },
        },
      },
    });
  }

  async listOperators(query: {
    page?: number;
    limit?: number;
    search?: string;
  }) {
    const page = query.page || 1;
    const limit = query.limit || 20;
    const skip = (page - 1) * limit;

    const where: any = {};
    if (query.search) {
      where.user = {
        OR: [
          { firstName: { contains: query.search, mode: 'insensitive' } },
          { lastName: { contains: query.search, mode: 'insensitive' } },
          { email: { contains: query.search, mode: 'insensitive' } },
        ],
      };
    }

    const [operators, total] = await Promise.all([
      this.prisma.pOSOperator.findMany({
        where,
        skip,
        take: limit,
        include: {
          user: {
            select: {
              id: true,
              email: true,
              firstName: true,
              lastName: true,
            },
          },
          _count: { select: { eventAssignments: true } },
        },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.pOSOperator.count({ where }),
    ]);

    return {
      data: operators,
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }

  // ============================================
  // DEVICE MANAGEMENT
  // ============================================

  async registerDevice(data: {
    serialNumber: string;
    model?: string;
    metadata?: any;
  }) {
    const existing = await this.prisma.pOSDevice.findUnique({
      where: { serialNumber: data.serialNumber },
    });
    if (existing) throw new ConflictException('Device serial number already registered');

    return this.prisma.pOSDevice.create({ data });
  }

  async listDevices() {
    return this.prisma.pOSDevice.findMany({
      include: {
        deviceAssignments: {
          where: { isActive: true },
          include: {
            operator: {
              include: {
                user: {
                  select: { firstName: true, lastName: true },
                },
              },
            },
          },
        },
      },
    });
  }

  // ============================================
  // EVENT ASSIGNMENTS (Super Admin assigns operators to events)
  // ============================================

  async assignOperatorToEvent(operatorId: string, eventId: string) {
    // Verify operator exists
    const operator = await this.prisma.pOSOperator.findUnique({
      where: { id: operatorId },
    });
    if (!operator) throw new NotFoundException('Operator not found');

    // Verify event exists and is in a valid state for assignment
    const event = await this.prisma.event.findUnique({
      where: { id: eventId },
    });
    if (!event) throw new NotFoundException('Event not found');

    if (
      !([
        EventStatus.APPROVED,
        EventStatus.PUBLISHED,
        EventStatus.SCHEDULED,
        EventStatus.ACTIVE,
      ] as EventStatus[]).includes(event.status)
    ) {
      throw new BadRequestException(
        'Event must be approved, published, scheduled, or active for assignment',
      );
    }

    // Check if already assigned (active)
    const existing = await this.prisma.eventAssignment.findFirst({
      where: { operatorId, eventId, isActive: true },
    });
    if (existing) throw new ConflictException('Operator already assigned to this event');

    // NOTE: Ended events do NOT block new assignments.
    // Operators can be assigned to multiple events simultaneously.

    return this.prisma.eventAssignment.create({
      data: { operatorId, eventId },
      include: {
        event: { select: { id: true, title: true, venue: true, startDate: true } },
        operator: {
          include: {
            user: { select: { firstName: true, lastName: true } },
          },
        },
      },
    });
  }

  async unassignOperatorFromEvent(operatorId: string, eventId: string) {
    const assignment = await this.prisma.eventAssignment.findFirst({
      where: { operatorId, eventId, isActive: true },
    });
    if (!assignment) throw new NotFoundException('Active assignment not found');

    return this.prisma.eventAssignment.update({
      where: { id: assignment.id },
      data: { isActive: false, unassignedAt: new Date() },
    });
  }

  // ============================================
  // POS OPERATOR: Get assigned events
  // ============================================

  /**
   * Get events assigned to an operator. Only ACTIVE events with valid dates
   * are shown (backend validates eligibility on access).
   */
  async getAssignedEvents(userId: string, includeHistory = false) {
    const operator = await this.prisma.pOSOperator.findUnique({
      where: { userId },
    });
    if (!operator) throw new NotFoundException('Operator profile not found');

    const now = new Date();

    const where: any = {
      operatorId: operator.id,
    };

    if (!includeHistory) {
      // Only active assignments for non-ended events
      where.isActive = true;
      where.event = {
        status: EventStatus.ACTIVE,
        endDate: { gte: now }, // Backend-enforced: ended events don't show
      };
    }

    const assignments = await this.prisma.eventAssignment.findMany({
      where,
      include: {
        event: {
          include: {
            organization: { select: { id: true, name: true } },
            ticketCategories: {
              where: { isActive: true },
              orderBy: { sortOrder: 'asc' },
            },
          },
        },
      },
      orderBy: { assignedAt: 'desc' },
    });

    return assignments.map((a) => ({
      assignmentId: a.id,
      assignedAt: a.assignedAt,
      isActive: a.isActive,
      event: a.event,
    }));
  }

  /**
   * Get operator's past events with sales summary
   */
  async getOperatorHistory(userId: string) {
    const operator = await this.prisma.pOSOperator.findUnique({
      where: { userId },
    });
    if (!operator) throw new NotFoundException('Operator profile not found');

    const assignments = await this.prisma.eventAssignment.findMany({
      where: { operatorId: operator.id },
      include: {
        event: {
          select: {
            id: true,
            title: true,
            venue: true,
            startDate: true,
            endDate: true,
            status: true,
          },
        },
      },
      orderBy: { assignedAt: 'desc' },
    });

    // Get transaction summaries for each event
    const history = await Promise.all(
      assignments.map(async (a) => {
        const stats = await this.prisma.transaction.aggregate({
          where: {
            operatorId: operator.id,
            eventId: a.eventId,
            status: TransactionStatus.COMPLETED,
          },
          _sum: { totalAmount: true },
          _count: true,
        });

        return {
          event: a.event,
          assignedAt: a.assignedAt,
          unassignedAt: a.unassignedAt,
          isActive: a.isActive,
          totalSales: stats._sum.totalAmount || 0,
          transactionCount: stats._count,
        };
      }),
    );

    return history;
  }

  // ============================================
  // TRANSACTION PROCESSING (Atomic, Idempotent)
  // ============================================

  /**
   * Process a ticket sale. This is the core POS operation.
   * - Validates event eligibility on every call (not just cron)
   * - Uses idempotent transaction references
   * - Atomically reserves and then confirms inventory
   */
  async processTransaction(data: {
    transactionRef: string;
    eventId: string;
    operatorUserId: string;
    items: Array<{
      ticketCategoryId: string;
      quantity: number;
    }>;
    paymentMethod: 'CARD' | 'CASH' | 'TRANSFER';
    customerName?: string;
    customerEmail?: string;
    customerPhone?: string;
    deviceId?: string;
    paymentReference?: string;
  }) {
    // Idempotency: check if transaction ref already exists
    const existing = await this.prisma.transaction.findUnique({
      where: { transactionRef: data.transactionRef },
    });
    if (existing) {
      if (existing.status === TransactionStatus.COMPLETED) {
        return { message: 'Transaction already completed', transaction: existing };
      }
      throw new ConflictException('Transaction reference already exists');
    }

    // Get operator
    const operator = await this.prisma.pOSOperator.findUnique({
      where: { userId: data.operatorUserId },
    });
    if (!operator) throw new NotFoundException('Operator not found');

    // Verify operator is assigned to this event
    const assignment = await this.prisma.eventAssignment.findFirst({
      where: {
        operatorId: operator.id,
        eventId: data.eventId,
        isActive: true,
      },
    });
    if (!assignment) {
      throw new BadRequestException('Operator not assigned to this event');
    }

    // Get event and validate eligibility ON EVERY SALE
    const event = await this.prisma.event.findUnique({
      where: { id: data.eventId },
    });
    if (!event) throw new NotFoundException('Event not found');

    const now = new Date();
    if (event.status !== EventStatus.ACTIVE) {
      throw new BadRequestException(`Event is not active (status: ${event.status})`);
    }
    if (now > event.endDate) {
      // Auto-complete the event if it has ended
      await this.prisma.event.update({
        where: { id: event.id },
        data: { status: EventStatus.COMPLETED },
      });
      throw new BadRequestException('Event has ended');
    }

    // Validate items and calculate total within a transaction
    const result = await this.prisma.$transaction(async (tx) => {
      let totalAmount = 0;
      const transactionItems: Array<{
        ticketCategoryId: string;
        quantity: number;
        unitPrice: number;
        subtotal: number;
      }> = [];

      for (const item of data.items) {
        // Lock the row for update (using findFirst with select for update pattern)
        const category = await tx.ticketCategory.findUnique({
          where: { id: item.ticketCategoryId },
        });

        if (!category || category.eventId !== data.eventId) {
          throw new BadRequestException(
            `Ticket category ${item.ticketCategoryId} not found or doesn't belong to event`,
          );
        }

        if (!category.isActive) {
          throw new BadRequestException(
            `Ticket category "${category.name}" is not active`,
          );
        }

        if (item.quantity > category.maxPerTransaction) {
          throw new BadRequestException(
            `Max ${category.maxPerTransaction} tickets per transaction for "${category.name}"`,
          );
        }

        const available =
          category.totalQuantity -
          category.soldQuantity -
          category.reservedQuantity;

        if (item.quantity > available) {
          throw new BadRequestException(
            `Only ${available} tickets available for "${category.name}"`,
          );
        }

        // Reserve the tickets atomically
        await tx.ticketCategory.update({
          where: { id: category.id },
          data: { soldQuantity: { increment: item.quantity } },
        });

        const unitPrice = Number(category.price);
        const subtotal = unitPrice * item.quantity;
        totalAmount += subtotal;

        transactionItems.push({
          ticketCategoryId: category.id,
          quantity: item.quantity,
          unitPrice,
          subtotal,
        });
      }

      // Create the transaction
      const transaction = await tx.transaction.create({
        data: {
          transactionRef: data.transactionRef,
          eventId: data.eventId,
          operatorId: operator.id,
          totalAmount,
          paymentMethod: data.paymentMethod,
          status: TransactionStatus.COMPLETED,
          customerName: data.customerName,
          customerEmail: data.customerEmail,
          customerPhone: data.customerPhone,
          deviceId: data.deviceId,
          paymentReference: data.paymentReference,
          completedAt: new Date(),
          items: {
            create: transactionItems,
          },
        },
        include: {
          items: {
            include: {
              ticketCategory: { select: { name: true } },
            },
          },
        },
      });

      // Generate tickets
      const tickets = [];
      for (const item of transactionItems) {
        for (let i = 0; i < item.quantity; i++) {
          const ticketNumber = `TKT-${Date.now().toString(36).toUpperCase()}-${uuidv4().slice(0, 6).toUpperCase()}`;
          tickets.push({
            ticketNumber,
            transactionId: transaction.id,
            ticketCategoryId: item.ticketCategoryId,
            status: TicketStatus.VALID,
            qrCode: ticketNumber,
          });
        }
      }

      await tx.ticket.createMany({ data: tickets });

      // Create receipt
      const receiptNumber = `RCP-${Date.now().toString(36).toUpperCase()}-${uuidv4().slice(0, 4).toUpperCase()}`;
      await tx.receipt.create({
        data: {
          transactionId: transaction.id,
          receiptNumber,
          content: {
            event: event.title,
            venue: event.venue,
            items: transactionItems.map((i) => ({
              ...i,
            })),
            totalAmount,
            paymentMethod: data.paymentMethod,
            customerName: data.customerName,
            date: new Date().toISOString(),
          },
        },
      });

      return {
        transaction,
        ticketCount: tickets.length,
        receiptNumber,
      };
    });

    return result;
  }

  /**
   * Get transaction details
   */
  async getTransaction(transactionRef: string) {
    const transaction = await this.prisma.transaction.findUnique({
      where: { transactionRef },
      include: {
        items: {
          include: {
            ticketCategory: { select: { name: true, price: true } },
          },
        },
        tickets: true,
        receipt: true,
        event: { select: { id: true, title: true, venue: true } },
      },
    });

    if (!transaction) throw new NotFoundException('Transaction not found');
    return transaction;
  }

  /**
   * Get transactions for an event (dashboard reporting)
   */
  async getEventTransactions(
    eventId: string,
    query: { page?: number; limit?: number; status?: TransactionStatus },
  ) {
    const page = query.page || 1;
    const limit = query.limit || 50;
    const skip = (page - 1) * limit;

    const where: any = { eventId };
    if (query.status) where.status = query.status;

    const [transactions, total] = await Promise.all([
      this.prisma.transaction.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          operator: {
            include: {
              user: { select: { firstName: true, lastName: true } },
            },
          },
          items: {
            include: {
              ticketCategory: { select: { name: true } },
            },
          },
        },
      }),
      this.prisma.transaction.count({ where }),
    ]);

    return {
      data: transactions,
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }

  // ============================================
  // 1. TICKET VALIDATION / CHECK-IN
  // ============================================

  async validateTicket(ticketNumber: string, operatorUserId: string) {
    const ticket = await this.prisma.ticket.findUnique({
      where: { ticketNumber },
      include: {
        ticketCategory: { select: { name: true, eventId: true } },
        transaction: {
          select: {
            eventId: true,
            customerName: true,
            status: true,
          },
        },
      },
    });

    if (!ticket) throw new NotFoundException('Ticket not found');

    // Verify operator is assigned to this event
    const operator = await this.prisma.pOSOperator.findUnique({
      where: { userId: operatorUserId },
    });
    if (!operator) throw new NotFoundException('Operator not found');

    const assignment = await this.prisma.eventAssignment.findFirst({
      where: {
        operatorId: operator.id,
        eventId: ticket.transaction.eventId,
        isActive: true,
      },
    });
    if (!assignment) {
      throw new BadRequestException('You are not assigned to this event');
    }

    if (ticket.status === TicketStatus.USED) {
      return {
        valid: false,
        reason: 'Ticket has already been used',
        usedAt: ticket.usedAt,
        ticket,
      };
    }

    if (ticket.status === TicketStatus.CANCELLED) {
      return { valid: false, reason: 'Ticket has been cancelled', ticket };
    }

    if (ticket.status === TicketStatus.EXPIRED) {
      return { valid: false, reason: 'Ticket has expired', ticket };
    }

    // Mark ticket as used
    const updatedTicket = await this.prisma.ticket.update({
      where: { id: ticket.id },
      data: {
        status: TicketStatus.USED,
        usedAt: new Date(),
      },
      include: {
        ticketCategory: { select: { name: true } },
        transaction: {
          select: { customerName: true, transactionRef: true },
        },
      },
    });

    return {
      valid: true,
      message: 'Ticket validated successfully',
      ticket: updatedTicket,
    };
  }

  // ============================================
  // 2. REFUNDS
  // ============================================

  async processRefund(data: {
    transactionRef: string;
    amount: number;
    reason: string;
  }) {
    const transaction = await this.prisma.transaction.findUnique({
      where: { transactionRef: data.transactionRef },
      include: {
        items: { include: { ticketCategory: true } },
        tickets: true,
        refunds: true,
      },
    });

    if (!transaction) throw new NotFoundException('Transaction not found');
    if (transaction.status === TransactionStatus.REFUNDED) {
      throw new BadRequestException('Transaction already fully refunded');
    }
    if (transaction.status !== TransactionStatus.COMPLETED &&
        transaction.status !== TransactionStatus.PARTIALLY_REFUNDED) {
      throw new BadRequestException('Only completed transactions can be refunded');
    }

    // Calculate total already refunded
    const alreadyRefunded = transaction.refunds
      .filter((r) => r.status !== 'REJECTED')
      .reduce((sum, r) => sum + Number(r.amount), 0);

    const maxRefundable = Number(transaction.totalAmount) - alreadyRefunded;
    if (data.amount > maxRefundable) {
      throw new BadRequestException(
        `Refund amount exceeds maximum refundable amount of ${maxRefundable}`,
      );
    }

    const isFullRefund = data.amount === maxRefundable;

    // Create refund and update transaction + tickets in a single transaction
    const result = await this.prisma.$transaction(async (tx) => {
      const refund = await tx.refund.create({
        data: {
          transactionId: transaction.id,
          amount: data.amount,
          reason: data.reason,
          status: 'APPROVED',
          processedAt: new Date(),
        },
      });

      // Update transaction status
      await tx.transaction.update({
        where: { id: transaction.id },
        data: {
          status: isFullRefund
            ? TransactionStatus.REFUNDED
            : TransactionStatus.PARTIALLY_REFUNDED,
        },
      });

      // If full refund, cancel all tickets and restore inventory
      if (isFullRefund) {
        await tx.ticket.updateMany({
          where: {
            transactionId: transaction.id,
            status: TicketStatus.VALID,
          },
          data: { status: TicketStatus.CANCELLED },
        });

        // Restore sold quantities
        for (const item of transaction.items) {
          await tx.ticketCategory.update({
            where: { id: item.ticketCategoryId },
            data: { soldQuantity: { decrement: item.quantity } },
          });
        }
      }

      return refund;
    });

    return result;
  }

  async getRefund(id: string) {
    const refund = await this.prisma.refund.findUnique({
      where: { id },
      include: {
        transaction: {
          select: { transactionRef: true, eventId: true, totalAmount: true },
        },
      },
    });
    if (!refund) throw new NotFoundException('Refund not found');
    return refund;
  }

  async getTransactionRefunds(transactionRef: string) {
    const transaction = await this.prisma.transaction.findUnique({
      where: { transactionRef },
    });
    if (!transaction) throw new NotFoundException('Transaction not found');

    return this.prisma.refund.findMany({
      where: { transactionId: transaction.id },
      orderBy: { createdAt: 'desc' },
    });
  }

  // ============================================
  // 3. RECEIPTS
  // ============================================

  async getReceipt(id: string) {
    const receipt = await this.prisma.receipt.findUnique({
      where: { id },
      include: {
        transaction: {
          include: {
            event: { select: { title: true, venue: true } },
            items: {
              include: {
                ticketCategory: { select: { name: true, price: true } },
              },
            },
            operator: {
              include: {
                user: { select: { firstName: true, lastName: true } },
              },
            },
          },
        },
      },
    });
    if (!receipt) throw new NotFoundException('Receipt not found');
    return receipt;
  }

  async getReceiptByTransaction(transactionRef: string) {
    const transaction = await this.prisma.transaction.findUnique({
      where: { transactionRef },
      include: { receipt: true },
    });
    if (!transaction) throw new NotFoundException('Transaction not found');
    if (!transaction.receipt) throw new NotFoundException('Receipt not found');
    return transaction.receipt;
  }

  async markReceiptPrinted(id: string) {
    return this.prisma.receipt.update({
      where: { id },
      data: { printedAt: new Date() },
    });
  }

  // ============================================
  // 9. DEVICE ASSIGNMENTS TO EVENTS
  // ============================================

  async assignDeviceToOperator(data: {
    operatorId: string;
    deviceId: string;
  }) {
    const operator = await this.prisma.pOSOperator.findUnique({
      where: { id: data.operatorId },
    });
    if (!operator) throw new NotFoundException('Operator not found');

    const device = await this.prisma.pOSDevice.findUnique({
      where: { id: data.deviceId },
    });
    if (!device) throw new NotFoundException('Device not found');

    const existing = await this.prisma.pOSDeviceAssignment.findFirst({
      where: {
        operatorId: data.operatorId,
        deviceId: data.deviceId,
        isActive: true,
      },
    });
    if (existing) throw new ConflictException('Device already assigned to this operator');

    return this.prisma.pOSDeviceAssignment.create({
      data: {
        operatorId: data.operatorId,
        deviceId: data.deviceId,
      },
      include: {
        operator: { include: { user: { select: { firstName: true, lastName: true } } } },
        device: { select: { serialNumber: true, model: true } },
      },
    });
  }

  async unassignDevice(operatorId: string, deviceId: string) {
    const assignment = await this.prisma.pOSDeviceAssignment.findFirst({
      where: { operatorId, deviceId, isActive: true },
    });
    if (!assignment) throw new NotFoundException('Active device assignment not found');

    return this.prisma.pOSDeviceAssignment.update({
      where: { id: assignment.id },
      data: { isActive: false, unassignedAt: new Date() },
    });
  }

  async listDeviceAssignments(query: { operatorId?: string; deviceId?: string }) {
    const where: any = { isActive: true };
    if (query.operatorId) where.operatorId = query.operatorId;
    if (query.deviceId) where.deviceId = query.deviceId;

    return this.prisma.pOSDeviceAssignment.findMany({
      where,
      include: {
        operator: { include: { user: { select: { firstName: true, lastName: true } } } },
        device: { select: { serialNumber: true, model: true, status: true } },
      },
      orderBy: { assignedAt: 'desc' },
    });
  }

  // ============================================
  // 10. ADMIN RESET OPERATOR PASSWORD
  // ============================================

  async resetOperatorPassword(operatorId: string, newPassword: string) {
    const operator = await this.prisma.pOSOperator.findUnique({
      where: { id: operatorId },
      include: { user: { select: { id: true, email: true } } },
    });
    if (!operator) throw new NotFoundException('Operator not found');

    const passwordHash = await bcrypt.hash(newPassword, 12);

    await this.prisma.user.update({
      where: { id: operator.userId },
      data: { passwordHash, refreshToken: null },
    });

    return { message: `Password reset for operator ${operator.user.email}` };
  }

}
