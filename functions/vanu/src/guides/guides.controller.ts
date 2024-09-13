import {
  Controller,
  Get,
  Req,
  Res,
  HttpStatus,
  HttpException,
  Post,
  Body,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { GuidesService } from './guides.service';
import axios, { AxiosResponse, AxiosRequestConfig } from 'axios';
import { config } from 'dotenv';
import { CommonService } from '../common/common.service';
import { DocumentData, getFirestore } from 'firebase-admin/firestore';
import { ParamsGuideDTO } from './paramsGuide.interface';

config();

@Controller('guides')
export class GuidesController {
  constructor(
    private guidesService: GuidesService,
    private commonService: CommonService,
  ) {}

  @Get('manifiesto')
  async getGuidesManifest(@Req() req: Request, @Res() res: Response) {
    try {
      const hasParams = await this.guidesService.checkParams(['fecha'], req);
      if (!hasParams) {
        throw new HttpException(
          'Parametros requeridos: fecha',
          HttpStatus.BAD_REQUEST,
        );
      }

      const params = req.query;
      let fecha = params.fecha.toString();
      fecha = this.guidesService.validateDate(fecha);

      const response = {
        statusCode: 400,
        headers: {
          'Content-Type': 'application/json',
        },
        body: '',
        isBase64Encoded: false,
      };

      if (fecha == null) {
        throw new HttpException(
          'Formato de fecha: yyyy-mm-dd',
          HttpStatus.BAD_REQUEST,
        );
      }

      let pdfBytes = null;
      const axiosConfig: AxiosRequestConfig = {
        method: 'get',
        url: `${process.env.SERVICLI_URI_MANIFEST}['${fecha}','${process.env.SERVICLI_AUTH_USER}','${process.env.SERVICLI_AUTH_PASS}','T']`,
      };
      await axios(axiosConfig)
        .then((res: AxiosResponse) => {
          return res.data;
        })
        .then((data) => {
          if (data.archivoEncriptado) {
            pdfBytes = data.archivoEncriptado;
          } else if (data.guia == 0) {
            response.body = data.mensaje;
            response.statusCode = HttpStatus.NOT_FOUND;
            response.headers['Content-Type'] = 'application/json';
          } else {
            console.error(data.mensaje);
            response.body = data.mensaje;
            response.statusCode = HttpStatus.BAD_REQUEST;
            response.headers['Content-Type'] = 'application/json';
          }
        })
        .catch((err) => {
          console.error('Error al obtener pdf del manifiesto');
          response.body = `Error al obtener pdf del manifiesto: ${err}`;
          response.statusCode = HttpStatus.INTERNAL_SERVER_ERROR;
          response.headers['Content-Type'] = 'application/json';
        });

      if (pdfBytes == null) {
        throw new HttpException(response.body, response.statusCode);
      }

      res
        .status(HttpStatus.OK)
        .setHeader('Content-Type', 'application/pdf')
        .send(pdfBytes);
    } catch (error) {
      res
        .status(error.status)
        .send({ error: `Hubo el siguiente error: ${error.response}` });
    }
  }

  @Get('generateGuideServiCli')
  async generateGuideServiCli(@Req() req: Request, @Res() res: Response) {
    try {
      await this.guidesService.sendDocuments();
      res
        .status(HttpStatus.OK)
        .setHeader('Content-Type', 'application/json')
        .send({ message: 'Guías generadas correctamente' });
    } catch (error) {
      res
        .status(error.status)
        .send({ error: `Hubo el siguiente error: ${error.response}` });
    }
  }

  @Post('deleteGuide')
  async deleteguide(
    @Req() req: Request,
    @Res() res: Response,
    @Body() parametros: ParamsGuideDTO,
  ) {
    const db: FirebaseFirestore.Firestore = getFirestore();
    req.body = JSON.parse(req.body);
    try {
      const hasParams: boolean = await this.guidesService.checkBodyParams(
        ['id', 'guia'],
        req,
      );
      if (!hasParams) {
        throw new HttpException(
          'Parametros requeridos: id, id_ciudad, id_sucursal, check',
          HttpStatus.BAD_REQUEST,
        );
      }

      const params = parametros.body;
      const guia = params.guia;
      const id = params.id;

      let deleted = false;
      await axios(
        process.env.SERVICLI_URI_GUIAS +
          `['${guia}','${process.env.SERVICLI_AUTH_USER}'` +
          `,'${process.env.SERVICLI_AUTH_PASS}']`,
        {
          method: 'DELETE',
        },
      )
        .then((res) => res.data)
        .then((data) => {
          const msj = 'LA GUÍA FUE ANULADA CORRECTAMENTE';
          const msj2 = 'LA GUÍA YA SE ENCUENTRA ANULADA';

          if (data.msj == msj || data.msj == msj2) {
            console.log(data.msj + '. Id ' + guia);
            this.commonService.addLogToFirestore(
              0,
              4,
              data.msj + '. Id ' + guia,
              '',
            );
            deleted = true;
          } else {
            console.error(data.msj + ' Id ' + guia);
            this.commonService.addLogToFirestore(
              1,
              4,
              data.msj + ' Id ' + guia,
              '',
            );
          }
        })
        .catch((err) => {
          console.error('Error al eliminar la guía ' + guia);
          console.error(err);
          this.commonService.addLogToFirestore(
            1,
            4,
            'Error al eliminar la guía ' + guia,
            err.toString(),
          );
        });
      if (!deleted) {
        throw new HttpException(
          'Error al anular la guía ' + guia,
          HttpStatus.INTERNAL_SERVER_ERROR,
        );
      }

      let doc: DocumentData | null = null;

      doc = (await db.collection('documentos').doc(id).get()).data();
      if (doc == null) {
        throw new HttpException(
          'No se encuentra documento ' + id,
          HttpStatus.NOT_FOUND,
        );
      }

      let updated = false;

      await db
        .collection('documentos')
        .doc(doc.id)
        .update({
          estado: 4,
          idGuia: null,
        })
        .then((response) => {
          if (response) {
            updated = true;
            console.log('Se ha actualizado el estado del Documento ' + id);
            this.commonService.addLogToFirestore(
              0,
              4,
              'Se ha actualizado el estado del Documento ' + id,
              '',
            );
          } else {
            console.error('Documento ' + id + ' no se ha podido actualizar');
            this.commonService.addLogToFirestore(
              1,
              4,
              'Documento ' + id + ' no se ha podido actualizar',
              '',
            );
          }
        })
        .catch((err) => {
          console.error('Error al actualizar estado del documento ', id);
          this.commonService.addLogToFirestore(
            1,
            4,
            'Error al actualizar estado del documento ' + id,
            err.toString(),
          );
        });
      if (!updated) {
        throw new HttpException(
          'Error al actualizar documento',
          HttpStatus.INTERNAL_SERVER_ERROR,
        );
      }
      res.status(HttpStatus.OK).send({ mensaje: 'Guía eliminada.' });
    } catch (error) {
      res.status(error.status).send({ mensaje: error.message });
    }
  }
}
