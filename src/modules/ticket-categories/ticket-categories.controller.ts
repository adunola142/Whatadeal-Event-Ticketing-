import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Param,
  Body,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { TicketCategoriesService } from './ticket-categories.service';
import { CreateTicketCategoryDto, UpdateTicketCategoryDto } from './dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators';

@ApiTags('Ticket Categories')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('ticket-categories')
export class TicketCategoriesController {
  constructor(private service: TicketCategoriesService) {}

  @Post()
  @Roles(UserRole.SUPER_ADMIN, UserRole.ORG_ADMIN, UserRole.EVENT_MANAGER)
  @ApiOperation({ summary: 'Create ticket category for an event' })
  create(@Body() data: CreateTicketCategoryDto) {
    return this.service.create(data);
  }

  @Get('event/:eventId')
  @ApiOperation({ summary: 'Get ticket categories for an event' })
  findByEvent(@Param('eventId') eventId: string) {
    return this.service.findByEvent(eventId);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get ticket category by ID' })
  findOne(@Param('id') id: string) {
    return this.service.findOne(id);
  }

  @Put(':id')
  @Roles(UserRole.SUPER_ADMIN, UserRole.ORG_ADMIN, UserRole.EVENT_MANAGER)
  @ApiOperation({ summary: 'Update ticket category' })
  update(@Param('id') id: string, @Body() data: UpdateTicketCategoryDto) {
    return this.service.update(id, data);
  }

  @Delete(':id')
  @Roles(UserRole.SUPER_ADMIN, UserRole.ORG_ADMIN, UserRole.EVENT_MANAGER)
  @ApiOperation({ summary: 'Delete ticket category (only if no tickets sold)' })
  delete(@Param('id') id: string) {
    return this.service.delete(id);
  }
}
