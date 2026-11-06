import { Module } from '@nestjs/common';
import { POSService } from './pos.service';
import { POSController } from './pos.controller';

@Module({
  controllers: [POSController],
  providers: [POSService],
  exports: [POSService],
})
export class POSModule {}
