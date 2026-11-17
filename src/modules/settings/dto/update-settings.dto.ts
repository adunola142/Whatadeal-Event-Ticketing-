import { IsBoolean, IsEmail, IsInt, IsNumber, IsOptional, IsString, Max, Min } from 'class-validator';

export class UpdateSettingsDto {
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(50)
  platformFeePercent?: number;

  @IsOptional()
  @IsBoolean()
  requireApproval?: boolean;

  @IsOptional()
  @IsBoolean()
  autoExpire?: boolean;

  @IsOptional()
  @IsBoolean()
  allowOrganizerRefundRequests?: boolean;

  @IsOptional()
  @IsString()
  paymentProvider?: string;

  @IsOptional()
  @IsString()
  receiptFooter?: string;

  @IsOptional()
  @IsEmail()
  supportEmail?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  maxTicketsPerTransaction?: number;
}
