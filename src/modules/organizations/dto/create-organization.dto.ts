import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsNotEmpty,
  IsOptional,
  IsString,
  IsEmail,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

export class OrganizationAdminDto {
  @ApiProperty({ example: 'Adaeze' })
  @IsNotEmpty()
  @IsString()
  firstName: string;

  @ApiProperty({ example: 'Okonkwo' })
  @IsNotEmpty()
  @IsString()
  lastName: string;

  @ApiProperty({ example: 'admin@acme-events.com' })
  @IsEmail()
  email: string;

  @ApiProperty({ example: 'TempPass#2026', description: 'Temporary password for first sign-in' })
  @IsString()
  @MinLength(8)
  password: string;
}

export class CreateOrganizationDto {
  @ApiProperty({ example: 'Acme Events Ltd' })
  @IsNotEmpty()
  @IsString()
  name: string;

  @ApiPropertyOptional({ example: 'Event management company' })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ example: 'https://acme-events.com' })
  @IsOptional()
  @IsString()
  website?: string;

  @ApiPropertyOptional({ example: 'info@acme-events.com' })
  @IsOptional()
  @IsEmail()
  email?: string;

  @ApiPropertyOptional({ example: '+2348012345678' })
  @IsOptional()
  @IsString()
  phone?: string;

  @ApiPropertyOptional({ example: '123 Victoria Island, Lagos' })
  @IsOptional()
  @IsString()
  address?: string;

  @ApiPropertyOptional({ type: () => OrganizationAdminDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => OrganizationAdminDto)
  admin?: OrganizationAdminDto;
}
