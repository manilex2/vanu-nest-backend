import { NestFactory } from '@nestjs/core';
import { ExpressAdapter } from '@nestjs/platform-express';
import * as express from 'express';
import { AppModule } from './app.module';
import * as admin from 'firebase-admin';
import { https, setGlobalOptions } from 'firebase-functions/v2';
import { Express } from 'express-serve-static-core';

admin.initializeApp();

setGlobalOptions({
  maxInstances: 10,
  timeoutSeconds: 540,
  memory: '1GiB',
});

const expressServer = express();

const createFunction = async (expressInstance: Express): Promise<void> => {
  const app = await NestFactory.create(
    AppModule,
    new ExpressAdapter(expressInstance),
  );
  await app.init();
};
export const api = https.onRequest(
  {
    cors: [
      /vanu-coh-az-knifgq\.flutterflow\.app$/,
      /app\.flutterflow\.io\/debug$/,
    ],
  },
  async (request, response) => {
    await createFunction(expressServer);
    expressServer(request, response);
  },
);
