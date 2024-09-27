import { Module } from '@nestjs/common';
import { DocumentsController } from './documents.controller';
import { DocumentsService } from './documents.service';
import { CommonService } from '../common/common.service';

@Module({
  controllers: [DocumentsController],
  providers: [DocumentsService, CommonService],
})
export class DocumentsModule {}
