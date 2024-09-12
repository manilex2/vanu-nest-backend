import { Controller, HttpStatus, Get, Req, Res } from '@nestjs/common';
import { Request, Response } from 'express';
import { DocumentsService } from './documents.service';

@Controller('documents')
export class DocumentsController {
  constructor(private documentsService: DocumentsService) {}

  @Get('saveNewDocuments')
  async saveNewDocuemnts(@Req() req: Request, @Res() res: Response) {
    try {
      await this.documentsService.insertSucursales();
      await this.documentsService.saveCities();
      await this.documentsService.saveStatusDocument();
      await this.documentsService.saveDocuments();
      res.status(HttpStatus.OK).send({ mensaje: 'Documentos guardados' });
    } catch (err) {
      console.error(err);
    }
  }
}
