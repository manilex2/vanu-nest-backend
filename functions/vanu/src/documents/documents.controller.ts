import {
  Controller,
  HttpStatus,
  Get,
  Req,
  Res,
  Post,
  Body,
  HttpException,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { DocumentsService } from './documents.service';
import { ParamsDTO } from './params.interface';
import { CommonService } from 'src/common/common.service';
import { config } from 'dotenv';

config();

@Controller('documents')
export class DocumentsController {
  constructor(
    private documentsService: DocumentsService,
    private commonService: CommonService,
  ) {}

  @Get('saveNewDocuments')
  async saveNewDocuments(@Req() req: Request, @Res() res: Response) {
    try {
      await this.documentsService.insertSucursales();
      await this.documentsService.saveCities();
      await this.documentsService.saveStatusDocument();
      await this.documentsService.saveDocuments();
      res.status(HttpStatus.OK).send({ mensaje: 'Documentos guardados' });
    } catch (err) {
      console.error(err);
      res
        .status(err.status || HttpStatus.INTERNAL_SERVER_ERROR)
        .send({ mensaje: `Hubo un error: ${err.message || err}` });
    }
  }

  @Post('updateDocumentCity')
  async updateDocumentCity(
    @Req() req: Request,
    @Res() res: Response,
    @Body() parametros: ParamsDTO,
  ) {
    try {
      const hasParams = await this.documentsService.checkParams(
        ['id', 'id_ciudad', 'id_sucursal'],
        req,
      );

      if (!hasParams) {
        throw new HttpException(
          'Parametros requeridos: id, id_ciudad, id_sucursal',
          HttpStatus.BAD_REQUEST,
        );
      }

      const id = parametros.id;
      const document = {
        id_ciudad_destino: parametros.id_ciudad || null,
        id_sucursal_destino: parametros.id_sucursal || null,
      };

      if (document.id_ciudad_destino == null && !document.id_ciudad_destino) {
        throw new HttpException(
          'Ciudad de destino no puede ser nulo',
          HttpStatus.BAD_REQUEST,
        );
      }

      let queryStatement = 'ciudad';
      let queryValues = [document.id_ciudad_destino];

      if (document.id_sucursal_destino != null) {
        queryStatement = 'sucursal';
        queryValues = [
          document.id_ciudad_destino,
          document.id_sucursal_destino,
        ];
      }

      const existCity = await this.commonService.checkCities(
        queryStatement,
        queryValues,
      );

      if (!existCity) {
        throw new HttpException(
          'No se pudo obtener la ciudad o sucursal especificada',
          HttpStatus.NOT_FOUND,
        );
      }

      let client = null;
      if (
        parametros.id_cliente != null &&
        parametros.razon_social != null &&
        parametros.telefonos != null &&
        parametros.direccion != null &&
        parametros.tipo != null &&
        parametros.email != null
      ) {
        client = {
          personaId: parametros.id_cliente,
          tipoId: parametros.tipo_id,
          razonSocial: parametros.razon_social,
          telefonos: parametros.telefonos,
          direccion: parametros.direccion,
          tipo: parametros.tipo,
          email: parametros.email,
        };
      }

      const updatedDB = await this.documentsService.updateDocument(
        id,
        document,
        client,
      );

      if (!updatedDB) {
        throw new HttpException(
          'Error al actualizar documento',
          HttpStatus.INTERNAL_SERVER_ERROR,
        );
      }

      res
        .status(HttpStatus.OK)
        .send({ mensaje: 'Actualización de documento ' + id + ' éxitosa' });
    } catch (err) {
      console.error(err);
      res
        .status(err.status || HttpStatus.INTERNAL_SERVER_ERROR)
        .send({ mensaje: `Hubo un error: ${err.message || err}` });
    }
  }
}
