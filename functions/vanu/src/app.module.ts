import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { GuidesModule } from './guides/guides.module';
import { DocumentsModule } from './documents/documents.module';
import { AuthModule } from './auth/auth.module';

@Module({
  imports: [GuidesModule, DocumentsModule, AuthModule],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
