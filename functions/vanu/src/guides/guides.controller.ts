import {
  Controller,
  Get,
  Req,
  Res,
  HttpStatus,
  HttpException,
  Delete,
  Query,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { GuidesService } from './guides.service';
import axios, { AxiosResponse, AxiosRequestConfig } from 'axios';
import { CommonService } from '../common/common.service';
import { DocumentData, getFirestore } from 'firebase-admin/firestore';
import { ParamsGuideDTO, ParamsManifiestoDTO } from './paramsGuide.interface';
import { ConfigService } from '@nestjs/config';

@Controller('guides')
export class GuidesController {
  constructor(
    private guidesService: GuidesService,
    private commonService: CommonService,
    private configService: ConfigService,
  ) {}

  @Get('manifiesto')
  async getGuidesManifest(
    @Req() req: Request,
    @Res() res: Response,
    @Query() date: ParamsManifiestoDTO,
  ) {
    try {
      const hasParams = await this.guidesService.checkParams(['fecha'], date);
      if (!hasParams) {
        throw new HttpException(
          'Parametros requeridos: fecha',
          HttpStatus.BAD_REQUEST,
        );
      }
      let fecha = date.fecha.toString();
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

      let pdfBytes: Buffer | null = null;
      const axiosConfig: AxiosRequestConfig = {
        method: 'get',
        url: `${this.configService.get<string>('SERVICLI_URI_MANIFEST')}['${fecha}','${this.configService.get<string>('SERVICLI_AUTH_USER')}','${this.configService.get<string>('SERVICLI_AUTH_PASS')}','T']`,
      };
      await axios(axiosConfig)
        .then((res: AxiosResponse) => {
          return res.data;
        })
        .then((data) => {
          if (data.archivoEncriptado) {
            pdfBytes = Buffer.from(data.archivoEncriptado, 'base64');
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

      this.guidesService.savePDFToFirebase(
        pdfBytes,
        `vanu/manifiestos/MANIFEST-${fecha}.pdf`,
      );

      const url = `${this.configService.get<string>('CDN_VANU')}/vanu%2Fmanifiestos%2FMANIFEST-${fecha}.pdf?alt=media`;

      res
        .setHeader('Content-Type', 'application/json')
        .status(HttpStatus.OK)
        .send({ message: url });
    } catch (error) {
      if (error instanceof HttpException) {
        console.log(JSON.stringify(error.message));
        res.setHeader('Content-Type', 'application/json');
        return res.status(error.getStatus()).send({
          message: `Hubo el siguiente error: ${error.message}`,
        });
      }
      console.log(JSON.stringify(error));
      res.setHeader('Content-Type', 'application/json');
      res.status(HttpStatus.INTERNAL_SERVER_ERROR).send({
        message: `Hubo el siguiente error: ${JSON.stringify(error)}`,
      });
    }
  }

  @Get('generateGuideServiCli')
  async generateGuideServiCli(@Req() req: Request, @Res() res: Response) {
    try {
      await this.guidesService.sendDocuments();
      res.setHeader('Content-Type', 'application/json');
      res
        .status(HttpStatus.OK)
        .send({ message: 'Guías generadas correctamente' });
    } catch (error) {
      if (error instanceof HttpException) {
        console.log(JSON.stringify(error.message));
        res.setHeader('Content-Type', 'application/json');
        return res.status(error.getStatus()).send({
          message: `Hubo el siguiente error: ${error.message}`,
        });
      }
      console.log(JSON.stringify(error));
      res.setHeader('Content-Type', 'application/json');
      res.status(HttpStatus.INTERNAL_SERVER_ERROR).send({
        message: `Hubo el siguiente error: ${JSON.stringify(error)}`,
      });
    }
  }

  @Delete('deleteGuide')
  async deleteguide(
    @Req() req: Request,
    @Res() res: Response,
    @Query() parametros: ParamsGuideDTO,
  ) {
    const db: FirebaseFirestore.Firestore = getFirestore();
    try {
      const hasParams: boolean = await this.guidesService.checkQueryParams(
        ['id', 'guia'],
        parametros,
      );
      if (!hasParams) {
        throw new HttpException(
          'Parametros requeridos: id, guia',
          HttpStatus.BAD_REQUEST,
        );
      }
      const guia = parametros.guia;
      const id = parametros.id;

      if (guia == null || id == null) {
        throw new HttpException(
          'Parametros requeridos no pueden ser null: id, guia',
          HttpStatus.BAD_REQUEST,
        );
      }

      let deleted = false;
      await axios(
        this.configService.get<string>('SERVICLI_URI_GUIAS') +
          `['${guia}','${this.configService.get<string>('SERVICLI_AUTH_USER')}'` +
          `,'${this.configService.get<string>('SERVICLI_AUTH_PASS')}']`,
        {
          method: 'DELETE',
        },
      )
        .then((res) => {
          return res.data;
        })
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
      res.setHeader('Content-Type', 'application/json');
      res.status(HttpStatus.NO_CONTENT).send();
    } catch (error) {
      if (error instanceof HttpException) {
        console.log(JSON.stringify(error.message));
        res.setHeader('Content-Type', 'application/json');
        return res.status(error.getStatus()).send({
          message: `Hubo el siguiente error: ${error.message}`,
        });
      }
      console.log(JSON.stringify(error));
      res.setHeader('Content-Type', 'application/json');
      res.status(HttpStatus.INTERNAL_SERVER_ERROR).send({
        message: `Hubo el siguiente error: ${JSON.stringify(error)}`,
      });
    }
  }
}
