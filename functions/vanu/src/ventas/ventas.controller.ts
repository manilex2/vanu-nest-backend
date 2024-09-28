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
      console.log(mensaje);
      res.setHeader('Content-Type', 'application/json');
      res.status(HttpStatus.OK).send({ message: mensaje });
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

  @Get('actualizarInstitutionMesAnio')
  async actualizarInstitutionMesAnio(
    @Req() req: Request,
    @Res() res: Response,
  ) {
    try {
      const mensaje = await this.ventasService.actualizarMesAnioInst();
      console.log(mensaje);
      res.setHeader('Content-Type', 'application/json');
      res.status(HttpStatus.OK).send({ message: mensaje });
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
