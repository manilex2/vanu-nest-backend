import {
  Controller,
  Get,
  HttpException,
  HttpStatus,
  Req,
  Res,
} from '@nestjs/common';
import { VentasService } from './ventas.service';
import { Request, Response } from 'express';

@Controller('ventas')
export class VentasController {
  constructor(private ventasService: VentasService) {}
  @Get('actualizar')
  async actualizarVentas(@Req() req: Request, @Res() res: Response) {
    try {
      const mensaje = await this.ventasService.actualizarVentasDelAnio();
      res
        .status(HttpStatus.OK)
        .setHeader('Content-Type', 'application/json')
        .send({ message: mensaje });
    } catch (error) {
      if (error instanceof HttpException) {
        res
          .status(error.getStatus())
          .setHeader('Content-Type', 'application/json')
          .send({
            message: `Hubo el siguiente error: ${error.message}`,
          });
      }
      res.status(HttpStatus.INTERNAL_SERVER_ERROR).send({
        message: `Hubo un error interno en el servidor.`,
      });
    }
  }
}
