import { ConfigService } from '@nestjs/config';
import { RequestJson } from './request.interface';
import { Injectable } from '@nestjs/common';

@Injectable()
export class Guides {
  constructor(private configService: ConfigService) {}

  getRequestJson(): RequestJson {
    const requestJson: RequestJson = {
      ID_TIPO_LOGISTICA: 1,
      DETALLE_ENVIO_1: '',
      DETALLE_ENVIO_2: '',
      DETALLE_ENVIO_3: '',
      ID_CIUDAD_ORIGEN: '',
      ID_CIUDAD_DESTINO: '',
      ID_DESTINATARIO_NE_CL: '',
      RAZON_SOCIAL_DESTI_NE: '',
      NOMBRE_DESTINATARIO_NE: '',
      APELLIDO_DESTINATAR_NE: '',
      DIRECCION1_DESTINAT_NE: '',
      SECTOR_DESTINAT_NE: '',
      TELEFONO1_DESTINAT_NE: '',
      TELEFONO2_DESTINAT_NE: '',
      CODIGO_POSTAL_DEST_NE: '',
      ID_REMITENTE_CL: this.configService.get<string>('REMITENTE_ID'),
      RAZON_SOCIAL_REMITE: this.configService.get<string>(
        'REMITENTE_RAZON_SOCIAL',
      ),
      NOMBRE_REMITENTE: this.configService.get<string>('REMITENTE_NOMBRE'),
      APELLIDO_REMITE: this.configService.get<string>('REMITENTE_APELLIDO'),
      DIRECCION1_REMITE: this.configService.get<string>('REMITENTE_DIRECCION'),
      SECTOR_REMITE: '',
      TELEFONO1_REMITE: this.configService.get<string>('REMITENTE_TELEFONO'),
      TELEFONO2_REMITE: '',
      CODIGO_POSTAL_REMI: '',
      ID_PRODUCTO: '',
      CONTENIDO: 'Accesorio de mujer',
      NUMERO_PIEZAS: 1,
      VALOR_MERCANCIA: 0,
      VALOR_ASEGURADO: 0,
      LARGO: 0,
      ANCHO: 0,
      ALTO: 0,
      PESO_FISICO: 2,
      LOGIN_CREACION: this.configService.get<string>('SERVICLI_AUTH_USER'),
      PASSWORD: this.configService.get<string>('SERVICLI_AUTH_PASS'),
      nombre_ciudad: '',
    };

    return requestJson;
  }
}
