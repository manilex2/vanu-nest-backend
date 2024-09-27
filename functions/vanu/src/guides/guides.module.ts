import { Module } from '@nestjs/common';
import { GuidesController } from './guides.controller';
import { GuidesService } from './guides.service';
import { CommonService } from '../common/common.service';
import { Guides } from './guides';

@Module({
  controllers: [GuidesController],
  providers: [GuidesService, CommonService, Guides],
})
export class GuidesModule {}
