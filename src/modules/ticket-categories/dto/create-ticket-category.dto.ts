import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString, IsNumber, IsDateString } from 'class-validator';

export class CreateTicketCategoryDto {
  @ApiProperty({ example: 'event-uuid-here' })
  @IsNotEmpty()
  @IsString()
  eventId: string;

  @ApiProperty({ example: 'VIP' })
  @IsNotEmpty()
  @IsString()
  name: string;

  @ApiPropertyOptional({ example: 'VIP access with front-row seating' })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiProperty({ example: 15000 })
  @IsNotEmpty()
  @IsNumber()
  price: number;

  @ApiProperty({ example: 500 })
  @IsNotEmpty()
  @IsNumber()
  totalQuantity: number;

  @ApiPropertyOptional({ example: 10, default: 10 })
  @IsOptional()
  @IsNumber()
  maxPerTransaction?: number;

  @ApiPropertyOptional({ example: 0 })
  @IsOptional()
  @IsNumber()
  sortOrder?: number;

  @ApiPropertyOptional({ example: '2026-12-01T00:00:00Z' })
  @IsOptional()
  @IsDateString()
  salesStartDate?: string;

  @ApiPropertyOptional({ example: '2026-12-20T00:00:00Z' })
  @IsOptional()
  @IsDateString()
  salesEndDate?: string;
}
