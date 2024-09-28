import {
  Controller,
  HttpStatus,
  Get,
  Req,
  Res,
  Body,
  HttpException,
  Put,
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
  async saveNewDocuments(@Req() req: Request, @Res() res: Response) {
    try {
      await this.documentsService.insertSucursales();
      await this.documentsService.saveCities();
      await this.documentsService.saveStatusDocument();
      await this.documentsService.saveDocuments();
      res.setHeader('Content-Type', 'application/json');
      res.status(HttpStatus.CREATED).send({ message: 'Documentos guardados' });
    } catch (err) {
      if (err instanceof HttpException) {
        console.log(JSON.stringify(err.message));
        res.setHeader('Content-Type', 'application/json');
        return res.status(err.getStatus()).send({
          message: `Hubo el siguiente error: ${err.message}`,
        });
      }
      console.log(JSON.stringify(err));
      res.setHeader('Content-Type', 'application/json');
      res.status(HttpStatus.INTERNAL_SERVER_ERROR).send({
        message: `Hubo el siguiente error: ${JSON.stringify(err)}`,
      });
    }
  }

  @Put('updateDocumentCity')
  async updateDocumentCity(
    @Req() req: Request,
    @Res() res: Response,
    @Body() parametros: ParamsDTO,
  ) {
    try {
      const hasParams = await this.documentsService.checkParams(
        ['id', 'id_ciudad'],
        parametros,
      );

      if (!hasParams) {
        throw new HttpException(
          'Parametros requeridos: id, id_ciudad',
          HttpStatus.BAD_REQUEST,
        );
      }

      const id = parametros.id;
      const document = {
        idCiudadDestino: parametros.id_ciudad || null,
        idSucursalDestino: parametros.id_sucursal || null,
        costoEnvio: parametros.costo_envio || null,
        tipoId:
          parametros.id_cliente && parametros.id_cliente.length == 10
            ? 'CEDULA'
            : 'RUC',
      };

      if (!document.idCiudadDestino) {
        throw new HttpException(
          'Ciudad de destino no puede ser nulo',
          HttpStatus.BAD_REQUEST,
        );
      }

      let queryStatement = 'ciudad';
      let queryValues = [document.idCiudadDestino];

      if (document.idSucursalDestino != null) {
        queryStatement = 'sucursal';
        queryValues = [document.idCiudadDestino, document.idSucursalDestino];
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

      res.setHeader('Content-Type', 'application/json');
      res
        .status(HttpStatus.OK)
        .send({ message: 'Actualización de documento ' + id + ' éxitosa' });
    } catch (err) {
      if (err instanceof HttpException) {
        console.log(JSON.stringify(err.message));
        res.setHeader('Content-Type', 'application/json');
        return res.status(err.getStatus()).send({
          message: `Hubo el siguiente error: ${err.message}`,
        });
      }
      console.log(JSON.stringify(err));
      res.setHeader('Content-Type', 'application/json');
      res.status(HttpStatus.INTERNAL_SERVER_ERROR).send({
        message: `Hubo el siguiente error: ${JSON.stringify(err)}`,
      });
    }
  }
}
