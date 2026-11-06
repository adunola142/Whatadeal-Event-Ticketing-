import {
  Controller,
  Get,
  Post,
  Put,
  Patch,
  Param,
  Body,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiQuery } from '@nestjs/swagger';
import { EventStatus, UserRole } from '@prisma/client';
import { EventsService } from './events.service';
import { CreateEventDto, UpdateEventDto } from './dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles, CurrentUser } from '../../common/decorators';

@ApiTags('Events')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('events')
export class EventsController {
  constructor(private eventsService: EventsService) {}

  @Post()
  @Roles(UserRole.SUPER_ADMIN, UserRole.ORG_ADMIN, UserRole.EVENT_MANAGER)
  @ApiOperation({ summary: 'Create a new event' })
  create(@Body() data: CreateEventDto) {
    const { organizationId, ...eventData } = data;
    return this.eventsService.create(eventData, organizationId);
  }

  @Get()
  @ApiOperation({ summary: 'List events' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'status', required: false, enum: EventStatus })
  @ApiQuery({ name: 'organizationId', required: false, type: String })
  @ApiQuery({ name: 'search', required: false, type: String })
  findAll(
    @Query('page') page?: number,
    @Query('limit') limit?: number,
    @Query('status') status?: EventStatus,
    @Query('organizationId') organizationId?: string,
    @Query('search') search?: string,
  ) {
    return this.eventsService.findAll({ page, limit, status, organizationId, search });
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get event by ID' })
  findOne(@Param('id') id: string) {
    return this.eventsService.findOne(id);
  }

  @Put(':id')
  @Roles(UserRole.SUPER_ADMIN, UserRole.ORG_ADMIN, UserRole.EVENT_MANAGER)
  @ApiOperation({ summary: 'Update event (draft/rejected only)' })
  update(
    @Param('id') id: string,
    @Body() data: UpdateEventDto,
    @CurrentUser('id') userId: string,
    @CurrentUser('role') userRole: UserRole,
  ) {
    return this.eventsService.update(id, data, userId, userRole);
  }

  @Patch(':id/submit')
  @Roles(UserRole.SUPER_ADMIN, UserRole.ORG_ADMIN, UserRole.EVENT_MANAGER)
  @ApiOperation({ summary: 'Submit event for approval' })
  submit(
    @Param('id') id: string,
    @CurrentUser('id') userId: string,
    @CurrentUser('role') userRole: UserRole,
  ) {
    return this.eventsService.submitForApproval(id, userId, userRole);
  }

  @Patch(':id/approve')
  @Roles(UserRole.SUPER_ADMIN)
  @ApiOperation({ summary: 'Approve event (Super Admin only)' })
  approve(
    @Param('id') id: string,
    @CurrentUser('id') userId: string,
  ) {
    return this.eventsService.approve(id, userId);
  }

  @Patch(':id/reject')
  @Roles(UserRole.SUPER_ADMIN)
  @ApiOperation({ summary: 'Reject event (Super Admin only)' })
  reject(
    @Param('id') id: string,
    @Body('reason') reason: string,
  ) {
    return this.eventsService.reject(id, reason);
  }

  @Patch(':id/publish')
  @Roles(UserRole.SUPER_ADMIN)
  @ApiOperation({ summary: 'Publish approved event' })
  publish(
    @Param('id') id: string,
    @CurrentUser('id') userId: string,
    @CurrentUser('role') userRole: UserRole,
  ) {
    return this.eventsService.publish(id, userId, userRole);
  }

  @Patch(':id/activate')
  @Roles(UserRole.SUPER_ADMIN)
  @ApiOperation({ summary: 'Activate event for sales' })
  activate(@Param('id') id: string) {
    return this.eventsService.activate(id);
  }

  @Patch(':id/complete')
  @Roles(UserRole.SUPER_ADMIN)
  @ApiOperation({ summary: 'Mark event as completed' })
  complete(@Param('id') id: string) {
    return this.eventsService.complete(id);
  }

  @Patch(':id/cancel')
  @Roles(UserRole.SUPER_ADMIN, UserRole.ORG_ADMIN)
  @ApiOperation({ summary: 'Cancel event' })
  cancel(@Param('id') id: string) {
    return this.eventsService.cancel(id);
  }
}
