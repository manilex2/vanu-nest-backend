import { Module } from '@nestjs/common';
import { GuidesController } from './guides.controller';
import { GuidesService } from './guides.service';
import { CommonService } from '../common/common.service';

@Module({
  controllers: [GuidesController],
  providers: [GuidesService, CommonService],
})
export class GuidesModule {}
