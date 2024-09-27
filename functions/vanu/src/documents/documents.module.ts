import { Module } from '@nestjs/common';
import { DocumentsController } from './documents.controller';
import { DocumentsService } from './documents.service';
import { CommonService } from '../common/common.service';
import { ConfigService } from '@nestjs/config';

@Module({
  controllers: [DocumentsController],
  providers: [DocumentsService, CommonService, ConfigService],
})
export class DocumentsModule {}
