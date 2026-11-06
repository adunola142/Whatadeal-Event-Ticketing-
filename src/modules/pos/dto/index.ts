import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString, IsNumber, IsArray, IsEnum, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

export class CreateOperatorDto {
  @ApiProperty({ example: 'user-uuid-here' })
  @IsNotEmpty()
  @IsString()
  userId: string;

  @ApiPropertyOptional({ example: 'EMP-001' })
  @IsOptional()
  @IsString()
  employeeId?: string;
}

export class RegisterDeviceDto {
  @ApiProperty({ example: 'SN-12345678' })
  @IsNotEmpty()
  @IsString()
  serialNumber: string;

  @ApiPropertyOptional({ example: 'PAX A920' })
  @IsOptional()
  @IsString()
  model?: string;

  @ApiPropertyOptional()
  @IsOptional()
  metadata?: any;
}

export class AssignOperatorDto {
  @ApiProperty({ example: 'operator-uuid' })
  @IsNotEmpty()
  @IsString()
  operatorId: string;

  @ApiProperty({ example: 'event-uuid' })
  @IsNotEmpty()
  @IsString()
  eventId: string;
}

class TransactionItemDto {
  @ApiProperty({ example: 'ticket-category-uuid' })
  @IsNotEmpty()
  @IsString()
  ticketCategoryId: string;

  @ApiProperty({ example: 2 })
  @IsNotEmpty()
  @IsNumber()
  quantity: number;
}

export class ProcessTransactionDto {
  @ApiProperty({ example: 'TXN-20261120-ABC123' })
  @IsNotEmpty()
  @IsString()
  transactionRef: string;

  @ApiProperty({ example: 'event-uuid' })
  @IsNotEmpty()
  @IsString()
  eventId: string;

  @ApiProperty({ type: [TransactionItemDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => TransactionItemDto)
  items: TransactionItemDto[];

  @ApiProperty({ enum: ['CARD', 'CASH', 'TRANSFER'], example: 'CARD' })
  @IsNotEmpty()
  @IsString()
  paymentMethod: 'CARD' | 'CASH' | 'TRANSFER';

  @ApiPropertyOptional({ example: 'John Doe' })
  @IsOptional()
  @IsString()
  customerName?: string;

  @ApiPropertyOptional({ example: 'john@example.com' })
  @IsOptional()
  @IsString()
  customerEmail?: string;

  @ApiPropertyOptional({ example: '+2348012345678' })
  @IsOptional()
  @IsString()
  customerPhone?: string;

  @ApiPropertyOptional({ example: 'device-uuid' })
  @IsOptional()
  @IsString()
  deviceId?: string;

  @ApiPropertyOptional({ example: 'PAY-REF-123' })
  @IsOptional()
  @IsString()
  paymentReference?: string;
}

export class ProcessRefundDto {
  @ApiProperty({ example: 'TXN-20261120-ABC123' })
  @IsNotEmpty()
  @IsString()
  transactionRef: string;

  @ApiProperty({ example: 5000 })
  @IsNotEmpty()
  @IsNumber()
  amount: number;

  @ApiProperty({ example: 'Customer requested refund' })
  @IsNotEmpty()
  @IsString()
  reason: string;
}

export class AssignDeviceDto {
  @ApiProperty({ example: 'operator-uuid' })
  @IsNotEmpty()
  @IsString()
  operatorId: string;

  @ApiProperty({ example: 'device-uuid' })
  @IsNotEmpty()
  @IsString()
  deviceId: string;
}

export class ResetPasswordDto {
  @ApiProperty({ example: 'newSecurePassword123' })
  @IsNotEmpty()
  @IsString()
  newPassword: string;
}
