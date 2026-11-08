import {
  Controller,
  Get,
  Post,
  Patch,
  Param,
  Body,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { UserRole, SettlementStatus } from '@prisma/client';
import { SettlementsService } from './settlements.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles, CurrentUser } from '../../common/decorators';
import { scopeOf } from '../../common/utils/organization-scope';

@ApiTags('Settlements')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('settlements')
export class SettlementsController {
  constructor(private service: SettlementsService) {}

  @Post()
  @Roles(UserRole.SUPER_ADMIN)
  @ApiOperation({ summary: 'Create a settlement record (Super Admin)' })
  create(
    @Body()
    data: {
      organizationId: string;
      eventId?: string;
      platformFeePercent: number;
      periodStart: string;
      periodEnd: string;
    },
  ) {
    return this.service.create(data);
  }

  @Get()
  @Roles(UserRole.SUPER_ADMIN, UserRole.ORG_ADMIN)
  @ApiOperation({ summary: 'List settlements' })
  findAll(
    @Query('page') page?: number,
    @Query('limit') limit?: number,
    @Query('organizationId') organizationId?: string,
    @Query('status') status?: SettlementStatus,
    @CurrentUser('id') actorId?: string,
    @CurrentUser('role') actorRole?: UserRole,
  ) {
    return this.service.findAll(
      { page, limit, organizationId, status },
      actorId && actorRole ? scopeOf(actorId, actorRole) : undefined,
    );
  }

  @Get(':id')
  @Roles(UserRole.SUPER_ADMIN, UserRole.ORG_ADMIN)
  @ApiOperation({ summary: 'Get settlement by ID' })
  findOne(
    @Param('id') id: string,
    @CurrentUser('id') actorId: string,
    @CurrentUser('role') actorRole: UserRole,
  ) {
    return this.service.findOne(id, scopeOf(actorId, actorRole));
  }

  @Patch(':id/status')
  @Roles(UserRole.SUPER_ADMIN)
  @ApiOperation({ summary: 'Update settlement status (Super Admin)' })
  updateStatus(
    @Param('id') id: string,
    @Body() data: { status: SettlementStatus },
  ) {
    return this.service.updateStatus(id, data.status);
  }
}
