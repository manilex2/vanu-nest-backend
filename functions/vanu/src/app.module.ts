import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { GuidesModule } from './guides/guides.module';
import { PruebaModule } from './prueba/prueba.module';

@Module({
  imports: [GuidesModule, PruebaModule],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
