import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { UpdateSettingsDto } from './dto/update-settings.dto';

export interface PlatformSettings {
  platformFeePercent: number;
  requireApproval: boolean;
  autoExpire: boolean;
  allowOrganizerRefundRequests: boolean;
  paymentProvider: string;
  receiptFooter: string;
  supportEmail: string;
  maxTicketsPerTransaction: number;
}

const KEY = 'platform';

export const DEFAULT_SETTINGS: PlatformSettings = {
  platformFeePercent: 3.5,
  requireApproval: true,
  autoExpire: true,
  allowOrganizerRefundRequests: true,
  paymentProvider: 'Paystack',
  receiptFooter: '',
  supportEmail: 'support@whatadeal.events',
  maxTicketsPerTransaction: 10,
};

@Injectable()
export class SettingsService {
  constructor(private prisma: PrismaService) {}

  async get(): Promise<PlatformSettings> {
    const row = await this.prisma.platformSetting.findUnique({ where: { key: KEY } });
    return { ...DEFAULT_SETTINGS, ...((row?.value as object) ?? {}) } as PlatformSettings;
  }

  async update(data: UpdateSettingsDto): Promise<PlatformSettings> {
    const current = await this.get();
    const next = { ...current, ...data };
    await this.prisma.platformSetting.upsert({
      where: { key: KEY },
      create: { key: KEY, value: next },
      update: { value: next },
    });
    return next;
  }
}
