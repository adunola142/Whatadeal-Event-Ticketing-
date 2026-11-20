import { Body, Controller, Get, Param, Patch, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { SettingsService } from './settings.service';
import { UpdateSettingsDto } from './dto/update-settings.dto';
import { UpdateOrgSettingsDto } from './dto/update-org-settings.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles, CurrentUser } from '../../common/decorators';
import { PrismaService } from '../../prisma/prisma.service';
import { requireOrgAccess, scopeOf } from '../../common/utils/organization-scope';

@ApiTags('Settings')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('settings')
export class SettingsController {
  constructor(
    private service: SettingsService,
    private prisma: PrismaService,
  ) {}

  @Get()
  @Roles(UserRole.SUPER_ADMIN)
  @ApiOperation({ summary: 'Get platform settings (Super Admin)' })
  get() {
    return this.service.get();
  }

  @Patch()
  @Roles(UserRole.SUPER_ADMIN)
  @ApiOperation({ summary: 'Update platform settings (Super Admin)' })
  update(@Body() data: UpdateSettingsDto) {
    return this.service.update(data);
  }

  @Get('organizations/:organizationId')
  @ApiOperation({ summary: "Get an organization's own settings (Org Admin or Super Admin)" })
  async getForOrg(
    @Param('organizationId') organizationId: string,
    @CurrentUser('id') userId: string,
    @CurrentUser('role') role: UserRole,
  ) {
    await requireOrgAccess(this.prisma, scopeOf(userId, role), organizationId);
    return this.service.getForOrg(organizationId);
  }

  @Patch('organizations/:organizationId')
  @ApiOperation({ summary: "Update an organization's own settings (Org Admin or Super Admin)" })
  async updateForOrg(
    @Param('organizationId') organizationId: string,
    @Body() data: UpdateOrgSettingsDto,
    @CurrentUser('id') userId: string,
    @CurrentUser('role') role: UserRole,
  ) {
    await requireOrgAccess(this.prisma, scopeOf(userId, role), organizationId);
    return this.service.updateForOrg(organizationId, data);
  }
}
