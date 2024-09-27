import { Module } from '@nestjs/common';
import { GuidesController } from './guides.controller';
import { GuidesService } from './guides.service';
import { CommonService } from '../common/common.service';
import { ConfigService } from '@nestjs/config';

@Module({
  controllers: [GuidesController],
  providers: [GuidesService, CommonService, ConfigService],
})
export class GuidesModule {}
