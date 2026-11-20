import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { UpdateSettingsDto } from './dto/update-settings.dto';
import { UpdateOrgSettingsDto } from './dto/update-org-settings.dto';

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

/**
 * The subset of settings an organization actually controls for itself —
 * everything else above (fees, approval policy, the payment provider) is
 * platform policy Whatadeal sets once for every organizer, not something an
 * individual organizer should be able to override for themselves.
 */
export type OrgSettings = Pick<
  PlatformSettings,
  'receiptFooter' | 'supportEmail' | 'maxTicketsPerTransaction' | 'allowOrganizerRefundRequests'
>;

const ORG_SETTINGS_KEYS: (keyof OrgSettings)[] = [
  'receiptFooter',
  'supportEmail',
  'maxTicketsPerTransaction',
  'allowOrganizerRefundRequests',
];

const KEY = 'platform';
const orgKey = (organizationId: string) => `org:${organizationId}`;

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

  /**
   * An organization's own settings, falling back to the platform defaults
   * for anything it hasn't overridden — stored under their own
   * `org:<organizationId>` row in the same key/value table, never in the
   * shared `platform` row, so one organizer's choices can't leak into
   * another's or into platform policy.
   */
  async getForOrg(organizationId: string): Promise<OrgSettings> {
    const [platform, row] = await Promise.all([
      this.get(),
      this.prisma.platformSetting.findUnique({ where: { key: orgKey(organizationId) } }),
    ]);
    const base = Object.fromEntries(
      ORG_SETTINGS_KEYS.map((k) => [k, platform[k]]),
    ) as OrgSettings;
    return { ...base, ...((row?.value as object) ?? {}) } as OrgSettings;
  }

  async updateForOrg(organizationId: string, data: UpdateOrgSettingsDto): Promise<OrgSettings> {
    const current = await this.getForOrg(organizationId);
    const next = { ...current, ...data };
    await this.prisma.platformSetting.upsert({
      where: { key: orgKey(organizationId) },
      create: { key: orgKey(organizationId), value: next },
      update: { value: next },
    });
    return next;
  }
}
