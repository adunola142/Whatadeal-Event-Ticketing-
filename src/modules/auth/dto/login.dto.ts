import { IsEmail, IsOptional, IsString, MinLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class LoginDto {
  @ApiProperty({ example: 'john@example.com' })
  @IsEmail()
  email: string;

  @ApiProperty({ example: 'SecurePass123!' })
  @IsString()
  @MinLength(8)
  password: string;

  // Sent by the POS app only (resolved client-side via the Remita SDK's
  // getDeviceSerial(), no network call needed). A POS_OPERATOR login is
  // rejected without a serial that resolves to an active terminal
  // assigned to them — see AuthService.login. Admin dashboard logins
  // never send this and are unaffected.
  @ApiPropertyOptional({ example: 'SN-12345678' })
  @IsOptional()
  @IsString()
  deviceSerial?: string;
}
