import {
  Controller,
  HttpStatus,
  Get,
  Req,
  Res,
  Post,
  Body,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { DocumentsService } from './documents.service';
import { ParamsDTO } from './params.interface';
import { CommonService } from 'src/common/common.service';

@Controller('documents')
export class DocumentsController {
  constructor(
    private documentsService: DocumentsService,
    private commonService: CommonService,
  ) {}

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
      res
        .status(HttpStatus.INTERNAL_SERVER_ERROR)
        .send({ mensaje: `Hubo un error: ${err}` });
    }
  }

  @Post('updateDocumentCity')
  async updateDocumentCity(
    @Req() req: Request,
    @Res() res: Response,
    @Body() parametros: ParamsDTO,
  ) {
    try {
      req.body = JSON.parse(req.body);
      const hasParams = await this.documentsService.checkParams(
        [
          'id',
          'id_ciudad',
          'id_sucursal',
          //"check",
        ],
        req,
      );

      if (!hasParams) {
        res.status(HttpStatus.BAD_REQUEST).send({
          mensaje: 'Parametros requeridos: id, id_ciudad, id_sucursal, check',
        });
      }

      const params = parametros.body;

      const id = params.id;
      const document = {
        id_ciudad_destino: params.id_ciudad || null,
        id_sucursal_destino: params.id_sucursal || null,
      };

      if (document.id_ciudad_destino == null && !document.id_ciudad_destino) {
        res.status(HttpStatus.BAD_REQUEST).send({
          mensaje: 'Ciudad de destino no puede ser 0 o nulo',
        });
      }

      let queryStatement = 'ciudad';
      let queryValues = [document.id_ciudad_destino];

      if (document.id_sucursal_destino) {
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
        res.status(HttpStatus.NOT_FOUND).send({
          mensaje: '"No se pudo obtener la ciudad o sucursal especificada"',
        });
      }

      let client = null;
      if (
        params.id_cliente != null &&
        params.razon_social != null &&
        params.telefonos != null &&
        params.direccion != null &&
        params.tipo != null &&
        params.email != null
      ) {
        client = {
          id: params.id_cliente,
          tipoId: params.tipo_id,
          razonSocial: params.razon_social,
          telefonos: params.telefonos,
          direccion: params.direccion,
          tipo: params.tipo,
          email: params.email,
        };
        client = JSON.stringify(client);
      }

      const updatedDB = await this.documentsService.updateDocument(
        id,
        document,
        client,
      );

      if (!updatedDB) {
        res.status(HttpStatus.INTERNAL_SERVER_ERROR).send({
          mensaje: 'Error al actualizar documento',
        });
      }

      res
        .status(HttpStatus.OK)
        .send({ mensaje: 'Actualización de documento ' + id + ' éxitosa' });
    } catch (err) {
      console.error(err);
      res
        .status(HttpStatus.INTERNAL_SERVER_ERROR)
        .send({ mensaje: `Hubo un error: ${err}` });
    }
  }
}
