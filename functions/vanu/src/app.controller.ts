import { Controller, Get, HttpStatus, Req, Res } from '@nestjs/common';
import { Request, Response } from 'express';

@Controller()
export class AppController {
  @Get('/')
  async helloWorld(@Req() req: Request, @Res() res: Response) {
    try {
      res.setHeader('Content-Type', 'application/json');
      res.status(HttpStatus.OK).send({ mensaje: 'Hello World' });
    } catch (err) {
      console.error(err);
    }
  }
}
