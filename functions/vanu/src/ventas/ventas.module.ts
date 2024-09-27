import { Module } from '@nestjs/common';
import { VentasController } from './ventas.controller';
import { VentasService } from './ventas.service';
import { ConfigService } from '@nestjs/config';

@Module({
  controllers: [VentasController],
  providers: [VentasService, ConfigService],
})
export class VentasModule {}
