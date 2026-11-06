import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString, IsNumber, IsBoolean, IsDateString } from 'class-validator';

export class CreateEventDto {
  @ApiProperty({ example: 'org-uuid-here' })
  @IsNotEmpty()
  @IsString()
  organizationId: string;

  @ApiProperty({ example: 'Lagos Music Festival 2026' })
  @IsNotEmpty()
  @IsString()
  title: string;

  @ApiPropertyOptional({ example: 'A two-day music festival' })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiProperty({ example: 'Eko Convention Centre' })
  @IsNotEmpty()
  @IsString()
  venue: string;

  @ApiPropertyOptional({ example: '123 Eko Atlantic, VI' })
  @IsOptional()
  @IsString()
  address?: string;

  @ApiPropertyOptional({ example: 'Lagos' })
  @IsOptional()
  @IsString()
  city?: string;

  @ApiPropertyOptional({ example: 'Lagos' })
  @IsOptional()
  @IsString()
  state?: string;

  @ApiPropertyOptional({ example: 'Nigeria' })
  @IsOptional()
  @IsString()
  country?: string;

  @ApiProperty({ example: '2026-12-20T10:00:00Z' })
  @IsNotEmpty()
  @IsDateString()
  startDate: string;

  @ApiProperty({ example: '2026-12-21T22:00:00Z' })
  @IsNotEmpty()
  @IsDateString()
  endDate: string;

  @ApiPropertyOptional({ example: 5000 })
  @IsOptional()
  @IsNumber()
  maxCapacity?: number;

  @ApiPropertyOptional({ example: true, default: true })
  @IsOptional()
  @IsBoolean()
  isPublic?: boolean;

  @ApiPropertyOptional({ example: 'https://example.com/banner.jpg' })
  @IsOptional()
  @IsString()
  bannerImage?: string;
}
