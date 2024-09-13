import { Injectable } from '@nestjs/common';
import {
  DocumentData,
  DocumentReference,
  Firestore,
  getFirestore,
} from 'firebase-admin/firestore';

import { md } from 'node-forge';

interface RowData {
  documento?: string;
  docRef?: DocumentReference;
  [key: string]: any; // Para permitir otras propiedades dinámicas
}

@Injectable()
export class CommonService {
  db: Firestore = getFirestore();
  /**
   * Registra un nuevo log en la tabla logs en Firestore.
   * @param {int} tipo - Id del tipo de log que se envía: 0 mensaje y 1 para error
   * @param {int} etapa - 1, guardado del Doc; 2 ,envío a ServiCli;
   *                      3, actualización de la ciudad; 4, eliminación de la guía
   * @param {string} descripcion - Descripción corta del log
   * @param {string} detalle - Más detalles del log, por ejemplo el error atrapado
   */
  async addLogToFirestore(
    tipo: number,
    etapa: number,
    descripcion: string,
    detalle: string,
  ) {
    const log: object = {
      idTipo: tipo,
      etapa: etapa,
      descripcion: descripcion,
      fecha: new Date(),
      detalle: detalle,
    };

    try {
      await this.db.collection('logs').add(log);
    } catch (error) {
      console.log(error);
    }
  }

  /**
   * Valida que los parametros no han sido alterados usando un Api Key
   * y valor hash enviado como parametro
   * de la petición.
   * @param {RowData} values - Valores de evaluación
   * * @param {string[]} params - Chequear si los parámetros son validos.
   * @return {boolean} True si coincide el valor hash recibido con el que se crea
   */
  async validateParams(values: RowData, params: string[]): Promise<boolean> {
    const sha256 = values.check.value;
    let value = '';

    params.forEach((k) => {
      if (k != 'check') {
        value += values[k].value;
      }
    });

    value += process.env.VANU_API_KEY;
    const mdRes = md.sha256.create();
    mdRes.update(value);

    return sha256 == mdRes.digest().toHex();
  }

  /**
   * Obtiene la sucursal especificando su id de la base de datos.
   * @param {DocumentReference} docRef - Document Ref de la sucursal
   * @return {Promise<DocumentData>} Sucursal encontrada o null
   */
  async getSucursal(docRef: DocumentReference): Promise<DocumentData> {
    let sucursal: DocumentData | null = null;
    try {
      sucursal = (await this.db.doc(docRef.id).get()).data();
    } catch (error) {
      console.error(error);
    }
    return sucursal;
  }

  /**
   * Obtiene la ciudad especificando su id de la base de datos.
   * @param {DocumentReference} docRef - Document Ref de la ciudad
   * @return {Promise<DocumentData>} La ciudad encontrada o null
   */
  async getCity(docRef: DocumentReference): Promise<DocumentData> {
    let city: DocumentData | null = null;
    try {
      city = (await this.db.doc(docRef.id).get()).data();
    } catch (error) {
      console.error(error);
    }
    return city;
  }

  /**
   * Verifica que existe la ciudad o sucursal especificada.
   * @param {string} queryStatement - El query que se realizará
   * @param {string[]} queryValues - Los valores o variables necesarias para el query
   * @return {boolean} True si existen en la base de datos
   */
  async checkCities(
    queryStatement: string,
    queryValues: string[],
  ): Promise<boolean> {
    let data: boolean | number;
    let exist = false;
    switch (queryStatement) {
      case 'ciudad':
        data = (await this.db.doc(queryValues[0]).get()).exists;
        if (data) {
          exist = true;
        }
        break;
      case 'sucursal':
        data = (await this.db.doc(queryValues[1]).get()).exists;
        if (data) {
          exist = true;
        }
      default:
        break;
    }
    return exist;
  }

  /**
   * Verifica si ya está guardado un documento en la base de datos
   * @param {string} documentoId - ID de Contifico del documento
   * @return {boolean | null} - True si existe
   */
  async checkDocument(documentoId: string): Promise<boolean | null> {
    let existDocument = false;
    let hasError = false;
    try {
      existDocument =
        (
          await this.db
            .collection('documentos')
            .where('documento', '==', documentoId)
            .get()
        ).docs.length > 0;
    } catch (error) {
      hasError = true;
      const errorMsg = 'Error al buscar documentos de la base de datos';
      console.error(errorMsg);
      console.error(error);
      // addLogToFirestore(1, 1, errorMsg, err.toString());
    }

    if (hasError) {
      return null;
    }

    return existDocument;
  }
}
