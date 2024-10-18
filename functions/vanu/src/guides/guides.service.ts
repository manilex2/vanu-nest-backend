import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { RequestJson } from './request.interface';
import { CommonService } from '../common/common.service';
import {
  DocumentData,
  DocumentReference,
  getFirestore,
} from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';
import axios, { AxiosResponse } from 'axios';
import { renderFile } from 'ejs';
import { createTransport, Transporter } from 'nodemailer';
import { ConfigService } from '@nestjs/config';
import { Guides } from './guides';
import { ParamsGuideDTO, ParamsManifiestoDTO } from './paramsGuide.interface';

interface RowData {
  idCiudad?: string;
  nombreCiudad?: string;
  [key: string]: any; // Para permitir otras propiedades dinámicas
}

interface ParamsEmail {
  fecha: Date;
  destinatario: string;
  documento: string;
  guia: number;
  direccion: string;
  ciudad: string;
  contenido: string;
  total: number;
  email_destinatario: string;
}

@Injectable()
export class GuidesService {
  constructor(
    private commonService: CommonService,
    private configService: ConfigService,
    private guides: Guides,
  ) {}

  db: FirebaseFirestore.Firestore = getFirestore();
  requestJson = this.guides.getRequestJson();
  /**
   * Valida si vienen todos los parametros necesarios.
   * @param {string[]} params - Parámetros requeridos.
   * @param {ParamsManifiestoDTO} query - Query traido de la consulta HTTP.
   * @return {boolean} Retorna true si los parámetros requeridos concuerdan con los que vienen en el Request.
   */
  async checkParams(
    params: string[],
    query: ParamsManifiestoDTO,
  ): Promise<boolean> {
    if (query) {
      const reqParamList: string[] = Object.keys(query);
      const hasAllRequiredParams: boolean = params.every((param) =>
        reqParamList.includes(param),
      );
      return hasAllRequiredParams;
    }
    return false;
  }

  /**
   * Valida si vienen todos los parametros necesarios en el body.
   * @param {string[]} params - Parámetros requeridos.
   * @param {ParamsGuideDTO} query - Query traido de la consulta HTTP.
   * @return {boolean} Retorna true si los parámetros requeridos concuerdan con los que vienen en el Request.
   */
  async checkQueryParams(
    params: string[],
    query: ParamsGuideDTO,
  ): Promise<boolean> {
    const reqParamList: string[] = Object.keys(query);
    const hasAllRequiredParams: boolean = params.every((param) =>
      reqParamList.hasOwnProperty(param),
    );
    return hasAllRequiredParams;
  }

  /**
   * Valida si la fecha se encuentra en el formato correcto.
   * Tratará de formaterala de forma correcta
   * @param {string} fecha - Fecha para consultar el manifiesto
   * @return {string} La fecha en el formato correcto o null.
   */
  validateDate(fecha: string): string {
    const regex: RegExp = new RegExp(
      /^(2\d\d\d)-(0[1-9]|1[0-2])-(0[1-9]|1\d|2\d|3[0-1])$/,
    );
    if (!regex.test(fecha)) {
      const parts: string[] = fecha.split('-');
      for (let i = 0; i < parts.length; i++) {
        if (parts[i].length == 1) {
          parts[i] = '0' + parts[i];
        }
      }
      fecha = parts.join('-');

      if (!regex.test(fecha)) {
        return null;
      }
    }

    return fecha;
  }

  /**
   * Obtiene los documentos 'pendientes' de la base de datos y los procesa
   * para crear la guía en ServiCli.
   * @param {string | null} idDocumento Id de documento a generar guia.
   * @return {boolean} - Retorna true si se pudo crear la guia.
   */
  async sendDocuments(idDocumento: string | null): Promise<boolean> {
    let generated: boolean = false;
    try {
      let documents: DocumentData[];

      if (!idDocumento) {
        documents = await this.getDocuments();
      } else {
        documents = await this.getSingleDocument(idDocumento);
      }

      if (documents != null && documents.length != 0) {
        for (const doc of documents) {
          delete doc['fechaEmision'];
          delete doc['fechaCreacion'];
          const client: DocumentData = await this.getClient(doc);

          if (client != null || client.email != null) {
            const body: RequestJson = await this.updateRequestBody(
              client,
              doc,
              this.requestJson,
            );

            const ciudad: RowData = {
              idCiudad: body['ID_CIUDAD_DESTINO'],
              nombreCiudad: body['nombre_ciudad'],
            };
            delete body['nombre_ciudad'];

            if (body != null) {
              const idGuia: number = await this.generateGuideServiCli(
                doc,
                body,
              );
              if (idGuia != null) {
                // setGuideToDocument(idGuia, doc);

                this.setGuide(idGuia, doc, ciudad, client);
              }
            }
          }
        }
        generated = true;
      }
      return generated;
    } catch (error) {
      throw new HttpException(error, HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  /**
   * @param {number} guia - Id de la guía de ServiCli
   * @param {DocumentData} document - Documento obtenido de la base de datos
   * @param {RowData} ciudad - Ciudad agregado en la referencia
   * @param {DocumentData | RowData} cliente - Objeto cliente del documento
   */
  async setGuide(
    guia: number,
    document: DocumentData,
    ciudad: RowData,
    cliente: DocumentData | RowData,
  ) {
    const existGuideToDocument: boolean = await this.setGuideToDocument(
      guia,
      document,
    );
    if (!existGuideToDocument) {
      return;
    }
    const bufferPdf = await this.getPDFGuide(guia, document);
    if (bufferPdf == null) {
      return;
    }

    const existPdf = await this.savePDFToFirebase(
      bufferPdf,
      `vanu/facturas/FAC-${document.documento}.pdf`,
    );

    if (!existPdf) {
      return;
    }

    const url = `${this.configService.get<string>('CDN_VANU')}/vanu%2Ffacturas%2FFAC-${document.documento}.pdf?alt=media`;

    const savedToDB = await this.savePDFToDB(document, url);
    if (!savedToDB) {
      return;
    }

    let date = new Date();
    date = new Date(date.getTime() - 5 * 1000 * 60 * 60);

    const paramsMail = {
      fecha: date,
      destinatario: this.requestJson['RAZON_SOCIAL_DESTI_NE'],
      documento: document.personaId,
      guia: guia,
      direccion: this.requestJson['DIRECCION1_DESTINAT_NE'],
      ciudad: ciudad.nombre,
      contenido: this.requestJson['CONTENIDO'],
      total: document.total,
      email_destinatario: cliente.email,
    };
    await this.sendMail(paramsMail);
  }

  /**
   * Crea una copia del request body con los nuevos campos
   * que se eniaran al API de ServiCli
   * @param {DocumentData | RowData} client - El objeto cliente
   * @param {DocumentData} document - El objeto documento
   * @param {RequestJson} body - El body incial
   * @return {RequestJson} El nuevo body
   */
  async updateRequestBody(
    client: DocumentData | RowData,
    document: DocumentData,
    body: RequestJson,
  ): Promise<RequestJson> {
    const names: string[] = client.razonSocial
      .replace(/( +|\t|\\t)+/g, ' ')
      .split(' ');
    const nameClient: string =
      names.length == 4 ? names[0] + ' ' + names[1] : names[0];
    const lastNameClient: string =
      names.length == 4 ? names[2] + ' ' + names[3] : names[1];

    const city: DocumentData | null = await this.commonService.getCity(
      document.idCiudadDestino,
    );
    const sucursal: DocumentData | null =
      'idSucursalDestino' in document && document.idSucursalDestino != null
        ? await this.commonService.getSucursal(document.idSucursalDestino)
        : null;

    if (city == null) {
      console.log('Error al obtener las ciudades');
      return null;
    }

    if (sucursal == null && document.idSucursalDestino != null) {
      console.log('Error al obtener las sucursales');
      return null;
    }

    body['nombre_ciudad'] = city.nombre;
    body['ID_CIUDAD_DESTINO'] = city.codigo;
    body['DIRECCION1_DESTINAT_NE'] =
      sucursal != null
        ? `RETIRO EN CS ${city.nombre} - ${sucursal.direccion}`
        : client.direccion;
    body['ID_DESTINATARIO_NE_CL'] = client.personaId;
    body['RAZON_SOCIAL_DESTI_NE'] = client.razonSocial;
    body['NOMBRE_DESTINATARIO_NE'] = nameClient;
    body['APELLIDO_DESTINATAR_NE'] = lastNameClient;
    body['TELEFONO1_DESTINAT_NE'] = client.telefonos[0];
    body['VALOR_MERCANCIA'] = document.total;

    return body;
  }

  /**
   * Genera una nueva guía en ServiCli usando un request body especifico.
   * @param {DocumentData} document - Objeto documento
   * @param {RequestJson} body - El request body con todos los campos necesarios
   * @return {number} - Id de la guía generada.
   */
  async generateGuideServiCli(
    document: DocumentData,
    body: RequestJson,
  ): Promise<number> {
    let idGuia: number | null = null;
    idGuia = 'idGuia' in document ? document.idGuia : 0;

    if (idGuia == null || idGuia == 0) {
      await axios(this.configService.get<string>('SERVICLI_URI_GUIAS'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        data: JSON.stringify(body),
      })
        .then((res: AxiosResponse) => {
          return res.data;
        })
        .then((data) => {
          if (data.id != 0) {
            idGuia = data.id;
          } else {
            const errorMsg =
              'Error al generar la guía del documento ' + document.id;
            console.error(errorMsg);
            console.error(data);
            // addLogToGlide(1, 2, errorMsg, JSON.stringify(data));
          }
        })
        .catch((err) => {
          const errorMsg =
            'Error al generar la guía del documento ' + document.id;
          console.error(errorMsg);
          console.error(err);
          // addLogToGlide(1, 2, errorMsg, err.toString());
        });
    }

    return idGuia;
  }

  /**
   * Guarda el id de la guía del documento especificado en la base de datos.
   * @param {number} guia - Id de la guía generada
   * @param {DocumentData} document - Objeto documento
   * @return {boolean} - True si en la base de datos
   *                  el documento ya tiene el número de la guía
   */
  async setGuideToDocument(
    guia: number,
    document: DocumentData,
  ): Promise<boolean> {
    let existGuide: boolean = false;
    if (document.estado == 1) {
      document['estado'] = 2;
      document['idGuia'] = guia;

      try {
        await this.db
          .doc(document.id)
          .update({
            estado: 2,
            idGuia: guia,
          })
          .then(() => {
            const msg =
              'Documento ' + document.id + ' actualizado con el id de la guía.';
            console.log(msg);
            existGuide = true;
          })
          .catch((err) => {
            throw new Error(err);
          });
      } catch (error) {
        const errorMsg =
          'Error al actualizar documento ' +
          document.id +
          ' con el id de la guía.';
        console.error(errorMsg);
        console.error(error);
      }
    } else {
      existGuide = true;
    }
    return existGuide;
  }

  /**
   * Obtiene el binario de la guía en pdf de ServiCli
   * @param {number} guia - Id de la guía
   * @param {DocumentData} document - Objeto documento
   * @return {Buffer | null} - Buffer del contenido del pdf en base64 o null
   */
  async getPDFGuide(
    guia: number,
    document: DocumentData,
  ): Promise<Buffer | null> {
    let bufferValue: Buffer | null = null;
    await axios(
      this.configService.get<string>('SERVICLI_URI_GUIAS_PDF') +
        `['${guia}','${this.configService.get<string>('SERVICLI_AUTH_USER')}',` +
        `'${this.configService.get<string>('SERVICLI_AUTH_PASS')}','1']`,
      {
        method: 'GET',
      },
    )
      .then((res) => {
        return res.data;
      })
      .then((data) => {
        if (data.archivoEncriptado != null && data.archivoEncriptado != '') {
          bufferValue = Buffer.from(data.archivoEncriptado, 'base64');
        } else {
          const errorMsg =
            'Error al obtener la guía en PDF del documento ' + document.id;
          console.error(errorMsg);
        }
      })
      .catch((err) => {
        const errorMsg =
          'Error al obtener la guía en PDF del documento ' + document.id;
        console.error(errorMsg);
        console.error(err);
      });
    return bufferValue;
  }

  /**
   * Obtiene la lista de documentos que seran enviados a ServiCli.
   * @return {Promise<DocumentData[]>} - Documentos selecionados
   */
  async getDocuments(): Promise<DocumentData[]> {
    let docs: DocumentData[] | null = null;
    console.log('Multiple Documents');
    try {
      docs = (
        await this.db
          .collection('documentos')
          .where('estado', '<', 3)
          .where('pagado', '==', true)
          .get()
      ).docs.map((doc) => {
        return doc.data();
      });
      return docs;
    } catch (error) {
      console.error(`Error al obtener los documentos de la base.`);
      console.error(error);
      throw error;
    }
  }

  /**
   * Obtiene un documento especifico que sera enviado a ServiCli.
   * @param {string} idDocumento Id de documento a buscar
   * @return {Promise<DocumentData[]>} - Documentos selecionados
   */
  async getSingleDocument(idDocumento: string): Promise<DocumentData[]> {
    let docs: DocumentData | null = null;
    console.log('Single Document');
    try {
      await this.db
        .collection('documentos')
        .doc(idDocumento)
        .update({ estado: 1 });
      docs = (
        await this.db.collection('documentos').doc(idDocumento).get()
      ).data();
      return [docs];
    } catch (error) {
      console.error(`Error al obtener los documentos de la base.`);
      console.error(error);
      throw error;
    }
  }

  /**
   * Obtiene el cliente del documento especificado.
   * @param {DocumentData} document - Objeto documento
   * @return {DocumentData} Cliente encontrado o null.
   */
  async getClient(document: DocumentData): Promise<DocumentData> {
    let client: DocumentData | null = null;
    if ('otroDestinatario' in document && document.otroDestinatario != null) {
      client = document.otroDestinatario;
    } else {
      try {
        const clientRef: DocumentReference = document.idClient;
        client = (await clientRef.get()).data();
      } catch (error) {
        console.error('Error al obtener cliente de la base.');
        console.error(error);
      }
    }

    return client;
  }

  /* async getProducts(documentRef) {
    let products: DocumentData[] = null;
    try {
      products = (
        await this.db
          .collection('detalles_productos')
          .where('idDocumento', '==', documentRef.id)
          .get()
      ).docs.map((producto) => {
        return producto.data();
      });
    } catch (error) {
      console.error('Error al obtener los productos de la base.');
      throw error;
    }
    return products;
  } */

  /**
   * Guarda el pdf en un bucket de AWS.
   * @param {Buffer} data - Buffer que contiene el pdf
   * @param {string} pdfPath - Ruta completa del pdf
   * @return {boolean} - True si se ha guardado o ya éxiste el pdf en S3.
   */
  async savePDFToFirebase(data: Buffer, pdfPath: string): Promise<boolean> {
    const storage = getStorage();
    const bucket = storage.bucket();

    let hasError = false;
    let hasPDF = false;

    await bucket
      .file(pdfPath)
      .exists()
      .then(async ([exists]) => {
        if (exists && pdfPath.startsWith('vanu/manifiestos')) {
          await bucket
            .file(pdfPath)
            .delete()
            .catch((err) => {
              console.error(
                'Error al eliminar Pdf de Manifiesto en Firebase Storage',
              );
              console.error(err);
              hasError = true;
            });
        } else if (exists) {
          hasPDF = true;
        }
      })
      .catch((err) => {
        console.error(
          'Error al verificar existencia de Pdf en Firebase Storage',
        );
        console.error(err);
        hasError = true;
      });

    if (hasError) {
      return false;
    }

    // Si el archivo no existe, subirlo
    if (!hasError && !hasPDF) {
      await bucket
        .file(pdfPath)
        .save(data, {
          contentType: 'application/pdf',
        })
        .then(async () => {
          console.log('Éxito al guardar pdf en Firebase Storage.');
          await bucket.file(pdfPath).makePublic();
          hasPDF = true;
        })
        .catch((err) => {
          const errorMsg = 'Error al guardar en Firebase Storage el pdf';
          console.error(errorMsg);
          console.error(err);
          hasError = true;
        });
    }

    return hasPDF;
  }

  /**
   * Guarda la url del pdf en S3 en la base de datos en el documento especificado
   * @param {DocumentData} document - Objeto documento
   * @param {string} url - Url del pdf almacenado en S3
   * @return {boolean} Si fue actualizado o no el documento.
   */
  async savePDFToDB(document: DocumentData, url: string): Promise<boolean> {
    document['urlGuiaPDF'] = url;
    document['estado'] = 3;

    let updated = false;

    try {
      await this.db
        .doc(document.id)
        .update({
          urlGuiaPDF: url,
          estado: 3,
        })
        .then(() => {
          const msg = 'Éxito al guardar la url del pdf de la guía en la base.';
          console.log(msg);
          updated = true;
        })
        .catch((err) => {
          throw new Error(err);
        });
    } catch (error) {
      const errorMsg =
        'Error al guardar la url del pdf del documento ' + document.id;
      console.error(errorMsg);
      console.error(error);
    }
    return updated;
  }

  /**
   * Envio por correo del resumen del pedido por Servientrega.
   * @param {ParamsEmail} params -
   * Lista de parametros necesarios para crear el template del correo.
   * @return {boolean} - True si se envío correctamento el correo.
   */
  async sendMail(params: ParamsEmail): Promise<boolean> {
    let hasSendedEmail: boolean = false;
    // create reusable transporter object using the default SMTP transport
    const transporter: Transporter = createTransport({
      host: this.configService.get<string>('MAIL_HOST'),
      secure: true, // true for 465, false for other ports
      auth: {
        user: this.configService.get<string>('MAIL_USER'), // generated ethereal user
        pass: this.configService.get<string>('MAIL_PASS'), // generated ethereal password
      },
    });
    const contextMail: object = {
      banner: this.configService.get<string>('VANU_BANNER_MAIL'),
      fecha: params.fecha
        .toLocaleDateString('es-ES', {
          weekday: 'long',
          year: 'numeric',
          month: 'long',
          day: 'numeric',
        })
        .toUpperCase(),
      cliente: params.destinatario.toUpperCase(),
      titulo: 'Se registró un envío por Servientrega',
      detalle: {
        documento: params.documento,
        guia: params.guia,
        destinatario: params.destinatario.toUpperCase(),
        direccion: params.direccion,
        ciudad: params.ciudad,
        contenido: params.contenido,
        total: '$' + params.total,
      },
      url_tracking:
        this.configService.get<string>('SERVICLI_URI_TRACKING') + params.guia,
      contacto: this.configService.get<string>('REMITENTE_TELEFONO'),
    };
    const html = await renderFile(
      './views/mail_send_guide_template.ejs',
      contextMail,
    );

    // send mail with defined transport object
    await transporter
      .sendMail({
        from: `"Vanu" <${this.configService.get<string>('MAIL_SENDER')}>`,
        bcc: '"Info Vanu Shop" <info@vanushop.com>',
        to: `"${params.destinatario}" <${params.email_destinatario}>`,
        subject: 'Registro de Pedido',
        html: html,
        attachments: [
          {
            filename: 'Guía #' + params.guia,
            contentType: 'application/pdf',
            encoding: 'base64',
            path:
              this.configService.get<string>('CDN_COHETE_AZUL') +
              '/vanu/FAC-' +
              params.documento +
              '.pdf',
          },
        ],
      })
      .then((res: { accepted: string | any[] }) => {
        if (res.accepted.length == 1) {
          hasSendedEmail = true;
          console.log('Correo enviado éxitosamente');
        }
      })
      .catch((err: any) => {
        console.error('Error al enviar correo');
        console.error(err);
      });
    return hasSendedEmail;
  }
}
