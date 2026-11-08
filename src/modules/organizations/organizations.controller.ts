import {
  Controller,
  Get,
  Post,
  Put,
  Patch,
  Delete,
  Param,
  Body,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiQuery } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { OrganizationsService } from './organizations.service';
import { CreateOrganizationDto } from './dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles, CurrentUser } from '../../common/decorators';
import { scopeOf } from '../../common/utils/organization-scope';

@ApiTags('Organizations')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('organizations')
export class OrganizationsController {
  constructor(private orgService: OrganizationsService) {}

  @Post()
  @Roles(UserRole.SUPER_ADMIN)
  @ApiOperation({ summary: 'Create organization (Super Admin onboards orgs)' })
  create(
    @Body() data: CreateOrganizationDto,
    @CurrentUser('id') userId: string,
  ) {
    return this.orgService.create(data, userId);
  }

  @Get()
  @Roles(UserRole.SUPER_ADMIN)
  @ApiOperation({ summary: 'List all organizations (Super Admin)' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'search', required: false, type: String })
  findAll(
    @Query('page') page?: number,
    @Query('limit') limit?: number,
    @Query('search') search?: string,
  ) {
    return this.orgService.findAll({ page, limit, search });
  }

  @Get('my')
  @ApiOperation({ summary: 'Get organizations the current user belongs to' })
  findMyOrgs(@CurrentUser('id') userId: string) {
    return this.orgService.findByUser(userId);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get organization by ID' })
  findOne(
    @Param('id') id: string,
    @CurrentUser('id') actorId: string,
    @CurrentUser('role') actorRole: UserRole,
  ) {
    return this.orgService.findOne(id, scopeOf(actorId, actorRole));
  }

  @Put(':id')
  @ApiOperation({ summary: 'Update organization' })
  update(
    @Param('id') id: string,
    @Body()
    data: {
      name?: string;
      description?: string;
      website?: string;
      email?: string;
      phone?: string;
      address?: string;
    },
    @CurrentUser('id') userId: string,
    @CurrentUser('role') userRole: UserRole,
  ) {
    return this.orgService.update(id, data, userId, userRole);
  }

  @Post(':id/members')
  @Roles(UserRole.SUPER_ADMIN, UserRole.ORG_ADMIN)
  @ApiOperation({ summary: 'Add member to organization' })
  addMember(
    @Param('id') orgId: string,
    @Body() data: { userId: string; role: UserRole },
    @CurrentUser('id') actorId: string,
    @CurrentUser('role') actorRole: UserRole,
  ) {
    return this.orgService.addMember(orgId, data, scopeOf(actorId, actorRole));
  }

  @Delete(':id/members/:userId')
  @Roles(UserRole.SUPER_ADMIN, UserRole.ORG_ADMIN)
  @ApiOperation({ summary: 'Remove member from organization' })
  removeMember(
    @Param('id') orgId: string,
    @Param('userId') userId: string,
    @CurrentUser('id') actorId: string,
    @CurrentUser('role') actorRole: UserRole,
  ) {
    return this.orgService.removeMember(orgId, userId, scopeOf(actorId, actorRole));
  }

  @Patch(':id/toggle-active')
  @Roles(UserRole.SUPER_ADMIN)
  @ApiOperation({ summary: 'Activate/deactivate organization (Super Admin)' })
  toggleActive(@Param('id') id: string) {
    return this.orgService.toggleActive(id);
  }
}
