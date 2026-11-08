import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEmail, IsEnum, IsNotEmpty, IsOptional, IsString, MinLength } from 'class-validator';
import { UserRole } from '@prisma/client';

export class CreateUserDto {
  @ApiProperty({ example: 'staff@whatadeal.com' })
  @IsEmail()
  email: string;

  @ApiProperty({ example: 'TempPass#2026', description: 'Temporary password the user signs in with' })
  @IsString()
  @MinLength(8)
  password: string;

  @ApiProperty({ example: 'Tolu' })
  @IsNotEmpty()
  @IsString()
  firstName: string;

  @ApiProperty({ example: 'Adeyemi' })
  @IsNotEmpty()
  @IsString()
  lastName: string;

  @ApiPropertyOptional({ example: '+2348012345678' })
  @IsOptional()
  @IsString()
  phone?: string;

  @ApiProperty({ enum: UserRole, example: UserRole.ORG_ADMIN })
  @IsEnum(UserRole)
  role: UserRole;
}

export class ResetUserPasswordDto {
  @ApiProperty({ example: 'TempPass#2026' })
  @IsString()
  @MinLength(8)
  newPassword: string;
}
