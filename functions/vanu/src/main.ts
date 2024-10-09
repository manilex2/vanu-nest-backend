import { NestFactory } from '@nestjs/core';
import { ExpressAdapter } from '@nestjs/platform-express';
import express from 'express';
import { AppModule } from './app.module';
import { https, setGlobalOptions } from 'firebase-functions/v2';
import { CorsOptions } from '@nestjs/common/interfaces/external/cors-options.interface';
import { Express } from 'express-serve-static-core';
import { INestApplication } from '@nestjs/common';
import * as admin from 'firebase-admin';

admin.initializeApp();

setGlobalOptions({
  maxInstances: 10,
  timeoutSeconds: 540,
  memory: '1GiB',
});

const expressServer = express();
let nestApp: INestApplication;

const createFunction = async (expressInstance: Express) => {
  if (!nestApp) {
    // Evita inicialización repetida
    nestApp = await NestFactory.create(
      AppModule,
      new ExpressAdapter(expressInstance),
    );

    const corsOptions: CorsOptions = {
      origin: [
        'https://vanu-coh-az-knifgq.flutterflow.app',
        'https://app.flutterflow.io/debug',
        'https://vanu-cohete-azul.web.app',
        'https://app.vanushop.com',
      ], // Lista de orígenes permitidos
      methods: 'GET, POST, PUT, DELETE, OPTIONS', // Métodos HTTP permitidos
      allowedHeaders: 'Content-Type, Authorization', // Encabezados permitidos
      credentials: true, // Si deseas habilitar cookies o autenticación
    };
    nestApp.enableCors(corsOptions); // Configura CORS en NestJS
    await nestApp.init(); // Inicializa la aplicación NestJS
  }
  return nestApp;
};

// Exporta la función Firebase
export const api = https.onRequest(async (request, response) => {
  await createFunction(expressServer); // Inicializa NestJS solo si no está ya inicializado
  expressServer(request, response); // Maneja la solicitud con el servidor Express
});
