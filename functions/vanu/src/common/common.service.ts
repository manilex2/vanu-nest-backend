import { Injectable } from '@nestjs/common';
import {
  DocumentData,
  DocumentReference,
  Firestore,
  getFirestore,
} from 'firebase-admin/firestore';

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
   * Obtiene la sucursal especificando su id de la base de datos.
   * @param {DocumentReference} sucursalRef - Document Ref de la sucursal
   * @return {Promise<DocumentData>} Sucursal encontrada o null
   */
  async getSucursal(sucursalRef: DocumentReference): Promise<DocumentData> {
    let sucursal: DocumentData | null = null;
    try {
      sucursal = (await sucursalRef.get()).data();
    } catch (error) {
      console.error(error);
    }
    return sucursal;
  }

  /**
   * Obtiene la ciudad especificando su id de la base de datos.
   * @param {DocumentReference} ciudadRef - Document Ref de la ciudad
   * @return {Promise<DocumentData>} La ciudad encontrada o null
   */
  async getCity(ciudadRef: DocumentReference): Promise<DocumentData> {
    let city: DocumentData | null = null;
    try {
      city = (await ciudadRef.get()).data();
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
    let exist: boolean = false;
    switch (queryStatement) {
      case 'ciudad':
        exist = (await this.db.doc(queryValues[0]).get()).exists;
        break;
      case 'sucursal':
        exist = (await this.db.doc(queryValues[1]).get()).exists;
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
    let existDocument: boolean = false;
    let hasError: boolean = false;
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
