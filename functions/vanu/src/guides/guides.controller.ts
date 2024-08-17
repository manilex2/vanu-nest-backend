import {
  Controller,
  Get,
  Req,
  Res,
  HttpStatus,
  HttpException,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { GuidesService } from './guides.service';
import axios, { AxiosResponse, AxiosRequestConfig } from 'axios';
import { config } from 'dotenv';

config();

@Controller('guides')
export class GuidesController {
  constructor(private guidesService: GuidesService) {}

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
}
