import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD, APP_FILTER, APP_INTERCEPTOR } from '@nestjs/core';
import configuration from './config/configuration';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './modules/auth/auth.module';
import { UsersModule } from './modules/users/users.module';
import { OrganizationsModule } from './modules/organizations/organizations.module';
import { EventsModule } from './modules/events/events.module';
import { TicketCategoriesModule } from './modules/ticket-categories/ticket-categories.module';
import { POSModule } from './modules/pos/pos.module';
import { DashboardModule } from './modules/dashboard/dashboard.module';
import { SettlementsModule } from './modules/settlements/settlements.module';
import { AuditLogsModule } from './modules/audit-logs/audit-logs.module';
import { JwtAuthGuard } from './modules/auth/guards/jwt-auth.guard';
import { AllExceptionsFilter } from './common/filters/http-exception.filter';
import { TransformInterceptor } from './common/interceptors/transform.interceptor';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [configuration],
    }),
    PrismaModule,
    AuthModule,
    UsersModule,
    OrganizationsModule,
    EventsModule,
    TicketCategoriesModule,
    POSModule,
    DashboardModule,
    SettlementsModule,
    AuditLogsModule,
  ],
  providers: [
    // Global JWT auth guard — use @Public() to skip
    {
      provide: APP_GUARD,
      useClass: JwtAuthGuard,
    },
    // Global exception filter
    {
      provide: APP_FILTER,
      useClass: AllExceptionsFilter,
    },
    // Global response transform
    {
      provide: APP_INTERCEPTOR,
      useClass: TransformInterceptor,
    },
  ],
})
export class AppModule {}
