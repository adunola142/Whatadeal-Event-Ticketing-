import {
  Controller,
  Get,
  Post,
  Put,
  Patch,
  Delete,
  Param,
  Body,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiQuery } from '@nestjs/swagger';
import { UserRole, TransactionStatus } from '@prisma/client';
import { POSService } from './pos.service';
import {
  CreateOperatorDto,
  RegisterDeviceDto,
  AssignOperatorDto,
  ProcessTransactionDto,
  ProcessRefundDto,
  AssignDeviceDto,
  ResetPasswordDto,
} from './dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles, CurrentUser } from '../../common/decorators';

@ApiTags('POS')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('pos')
export class POSController {
  constructor(private posService: POSService) {}

  // ---- Operator Management ----

  @Post('operators')
  @Roles(UserRole.SUPER_ADMIN)
  @ApiOperation({ summary: 'Register a POS operator (Super Admin)' })
  createOperator(@Body() data: CreateOperatorDto) {
    return this.posService.createOperator(data);
  }

  @Get('operators')
  @Roles(UserRole.SUPER_ADMIN)
  @ApiOperation({ summary: 'List all POS operators (Super Admin)' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'search', required: false, type: String })
  listOperators(
    @Query('page') page?: number,
    @Query('limit') limit?: number,
    @Query('search') search?: string,
  ) {
    return this.posService.listOperators({ page, limit, search });
  }

  // ---- Device Management ----

  @Post('devices')
  @Roles(UserRole.SUPER_ADMIN)
  @ApiOperation({ summary: 'Register a POS device' })
  registerDevice(@Body() data: RegisterDeviceDto) {
    return this.posService.registerDevice(data);
  }

  @Get('devices')
  @Roles(UserRole.SUPER_ADMIN)
  @ApiOperation({ summary: 'List all POS devices' })
  listDevices() {
    return this.posService.listDevices();
  }

  // ---- Event Assignments ----

  @Post('assignments')
  @Roles(UserRole.SUPER_ADMIN)
  @ApiOperation({ summary: 'Assign operator to event (Super Admin)' })
  assignOperator(@Body() data: AssignOperatorDto) {
    return this.posService.assignOperatorToEvent(data.operatorId, data.eventId);
  }

  @Delete('assignments/:operatorId/:eventId')
  @Roles(UserRole.SUPER_ADMIN)
  @ApiOperation({ summary: 'Unassign operator from event (Super Admin)' })
  unassignOperator(
    @Param('operatorId') operatorId: string,
    @Param('eventId') eventId: string,
  ) {
    return this.posService.unassignOperatorFromEvent(operatorId, eventId);
  }

  // ---- POS Operator: My Events ----

  @Get('my-events')
  @Roles(UserRole.POS_OPERATOR)
  @ApiOperation({ summary: 'Get assigned active events (POS Operator)' })
  getMyEvents(@CurrentUser('id') userId: string) {
    return this.posService.getAssignedEvents(userId, false);
  }

  @Get('my-history')
  @Roles(UserRole.POS_OPERATOR)
  @ApiOperation({ summary: 'Get past events with sales summary (POS Operator)' })
  getMyHistory(@CurrentUser('id') userId: string) {
    return this.posService.getOperatorHistory(userId);
  }

  // ---- Transaction Processing ----

  @Post('transactions')
  @Roles(UserRole.POS_OPERATOR)
  @ApiOperation({ summary: 'Process a ticket sale (POS Operator)' })
  processTransaction(
    @CurrentUser('id') userId: string,
    @Body() data: ProcessTransactionDto,
  ) {
    return this.posService.processTransaction({
      ...data,
      operatorUserId: userId,
    });
  }

  @Get('transactions/:ref')
  @ApiOperation({ summary: 'Get transaction by reference' })
  getTransaction(@Param('ref') ref: string) {
    return this.posService.getTransaction(ref);
  }

  @Get('transactions/event/:eventId')
  @Roles(UserRole.SUPER_ADMIN, UserRole.ORG_ADMIN)
  @ApiOperation({ summary: 'Get transactions for an event' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'status', required: false, enum: ['PENDING', 'COMPLETED', 'FAILED', 'REFUNDED', 'PARTIALLY_REFUNDED'] })
  getEventTransactions(
    @Param('eventId') eventId: string,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
    @Query('status') status?: TransactionStatus,
  ) {
    return this.posService.getEventTransactions(eventId, { page, limit, status });
  }

  // ---- Ticket Validation ----

  @Post('tickets/:ticketNumber/validate')
  @Roles(UserRole.POS_OPERATOR)
  @ApiOperation({ summary: 'Validate and check-in a ticket (POS Operator)' })
  validateTicket(
    @Param('ticketNumber') ticketNumber: string,
    @CurrentUser('id') userId: string,
  ) {
    return this.posService.validateTicket(ticketNumber, userId);
  }

  // ---- Refunds ----

  @Post('refunds')
  @Roles(UserRole.SUPER_ADMIN)
  @ApiOperation({ summary: 'Process a refund (Super Admin)' })
  processRefund(@Body() data: ProcessRefundDto) {
    return this.posService.processRefund(data);
  }

  @Get('refunds/:id')
  @Roles(UserRole.SUPER_ADMIN, UserRole.ORG_ADMIN)
  @ApiOperation({ summary: 'Get refund details' })
  getRefund(@Param('id') id: string) {
    return this.posService.getRefund(id);
  }

  @Get('refunds/transaction/:transactionRef')
  @Roles(UserRole.SUPER_ADMIN, UserRole.ORG_ADMIN)
  @ApiOperation({ summary: 'Get refunds for a transaction' })
  getTransactionRefunds(@Param('transactionRef') transactionRef: string) {
    return this.posService.getTransactionRefunds(transactionRef);
  }

  // ---- Receipts ----

  @Get('receipts/:id')
  @ApiOperation({ summary: 'Get receipt by ID' })
  getReceipt(@Param('id') id: string) {
    return this.posService.getReceipt(id);
  }

  @Get('receipts/transaction/:transactionRef')
  @ApiOperation({ summary: 'Get receipt by transaction reference' })
  getReceiptByTransaction(@Param('transactionRef') transactionRef: string) {
    return this.posService.getReceiptByTransaction(transactionRef);
  }

  @Patch('receipts/:id/printed')
  @Roles(UserRole.POS_OPERATOR)
  @ApiOperation({ summary: 'Mark receipt as printed' })
  markReceiptPrinted(@Param('id') id: string) {
    return this.posService.markReceiptPrinted(id);
  }

  // ---- Device Assignments ----

  @Post('device-assignments')
  @Roles(UserRole.SUPER_ADMIN)
  @ApiOperation({ summary: 'Assign device to operator (Super Admin)' })
  assignDevice(@Body() data: AssignDeviceDto) {
    return this.posService.assignDeviceToOperator(data);
  }

  @Delete('device-assignments/:operatorId/:deviceId')
  @Roles(UserRole.SUPER_ADMIN)
  @ApiOperation({ summary: 'Unassign device from operator (Super Admin)' })
  unassignDevice(
    @Param('operatorId') operatorId: string,
    @Param('deviceId') deviceId: string,
  ) {
    return this.posService.unassignDevice(operatorId, deviceId);
  }

  @Get('device-assignments')
  @Roles(UserRole.SUPER_ADMIN)
  @ApiOperation({ summary: 'List device assignments' })
  @ApiQuery({ name: 'operatorId', required: false, type: String })
  @ApiQuery({ name: 'deviceId', required: false, type: String })
  listDeviceAssignments(
    @Query('operatorId') operatorId?: string,
    @Query('deviceId') deviceId?: string,
  ) {
    return this.posService.listDeviceAssignments({ operatorId, deviceId });
  }

  // ---- Admin Reset Operator Password ----

  @Patch('operators/:id/reset-password')
  @Roles(UserRole.SUPER_ADMIN)
  @ApiOperation({ summary: 'Reset operator password (Super Admin)' })
  resetOperatorPassword(
    @Param('id') id: string,
    @Body() data: ResetPasswordDto,
  ) {
    return this.posService.resetOperatorPassword(id, data.newPassword);
  }
}
