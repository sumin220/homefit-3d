import { Module } from '@nestjs/common';
import { HomeFitController } from './homefit.controller';
import { ArgonService } from './argon.service';

@Module({
  controllers: [HomeFitController],
  providers: [ArgonService],
})
export class AppModule {}
