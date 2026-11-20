import { IsBoolean, IsEmail, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

/**
 * The settings an organization admin may change for their own
 * organization — a deliberate subset of UpdateSettingsDto. Fee percentage,
 * approval policy, and the payment provider stay platform-wide and are
 * only ever changed through the Super Admin settings endpoint.
 */
export class UpdateOrgSettingsDto {
  @IsOptional()
  @IsBoolean()
  allowOrganizerRefundRequests?: boolean;

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
