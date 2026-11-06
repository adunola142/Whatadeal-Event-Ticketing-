import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { DashboardService } from './dashboard.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators';

@ApiTags('Dashboard')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('dashboard')
export class DashboardController {
  constructor(private dashboardService: DashboardService) {}

  @Get('admin')
  @Roles(UserRole.SUPER_ADMIN)
  @ApiOperation({ summary: 'Platform-wide stats (Super Admin)' })
  getSuperAdminStats() {
    return this.dashboardService.getSuperAdminStats();
  }

  @Get('org/:organizationId')
  @Roles(UserRole.SUPER_ADMIN, UserRole.ORG_ADMIN)
  @ApiOperation({ summary: 'Organization stats' })
  getOrgStats(@Param('organizationId') orgId: string) {
    return this.dashboardService.getOrgStats(orgId);
  }

  @Get('event/:eventId')
  @ApiOperation({ summary: 'Event-level stats' })
  getEventStats(@Param('eventId') eventId: string) {
    return this.dashboardService.getEventStats(eventId);
  }
}
