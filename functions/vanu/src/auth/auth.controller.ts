import {
  Controller,
  Req,
  Res,
  HttpStatus,
  Post,
  Body,
  Put,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { AuthService } from './auth.service';
import { config } from 'dotenv';
import { Usuario } from './auth.interface';

config();

@Controller('auth')
export class AuthController {
  constructor(private authService: AuthService) {}

  @Post('signUp')
  async registrarUsuario(
    @Req() _req: Request,
    @Res() res: Response,
    @Body() usuario: Usuario,
  ) {
    try {
      const user = await this.authService.signUp(usuario);
      res
        .status(HttpStatus.OK)
        .setHeader('Content-Type', 'application/json')
        .send({ message: user });
    } catch (error) {
      res.status(error.status || HttpStatus.INTERNAL_SERVER_ERROR).send({
        message: `Hubo el siguiente error: ${error.message || error}`,
      });
    }
  }

  @Post('resetPassword')
  async resetearClave(
    @Req() req: Request,
    @Res() res: Response,
    @Body() usuario: Usuario,
  ) {
    try {
      const reset = await this.authService.resetPassword(usuario);
      res
        .status(HttpStatus.OK)
        .setHeader('Content-Type', 'application/json')
        .send({ message: reset });
    } catch (error) {
      res.status(error.status || HttpStatus.INTERNAL_SERVER_ERROR).send({
        message: `Hubo el siguiente error: ${error.message || error}`,
      });
    }
  }

  @Post('confirmResetPassword')
  async confirmResetearClave(
    @Req() req: Request,
    @Res() res: Response,
    @Body() body: Usuario,
  ) {
    try {
      const reset = await this.authService.confirmResetPassword(body);
      res
        .status(HttpStatus.OK)
        .setHeader('Content-Type', 'application/json')
        .send({ message: reset });
    } catch (error) {
      res.status(error.status || HttpStatus.INTERNAL_SERVER_ERROR).send({
        message: `Hubo el siguiente error: ${error.message || error}`,
      });
    }
  }

  @Put('changePassword')
  async cambiarClave(
    @Req() req: Request,
    @Res() res: Response,
    @Body() body: Usuario,
  ) {
    try {
      const change = await this.authService.changePassword(body);
      res
        .status(HttpStatus.OK)
        .setHeader('Content-Type', 'application/json')
        .send({ message: change });
    } catch (error) {
      res.status(error.status || HttpStatus.INTERNAL_SERVER_ERROR).send({
        message: `Hubo el siguiente error: ${error.message || error}`,
      });
    }
  }
}
