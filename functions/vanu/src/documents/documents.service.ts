import { Injectable } from '@nestjs/common';
import axios, { AxiosResponse } from 'axios';
import { CommonService } from '../common/common.service';
import { Contifico, Persona } from './contifico.interface';
import { ClienteDB, DocumentosDB } from 'src/common/database.interface';
import {
  DocumentData,
  DocumentReference,
  Firestore,
  getFirestore,
} from 'firebase-admin/firestore';
import sucursales from '../common/sucursales.json';
import { Request } from 'express';
import { config } from 'dotenv';

config();

@Injectable()
export class DocumentsService {
  constructor(private commonService: CommonService) {}

  db: Firestore = getFirestore();

  /**
   * Guarda los documentos nuevos en la base de datos.
   */
  async saveDocuments() {
    let date: number | Date = Date.now();
    date = new Date(date - 5 * 1000 * 60 * 60);
    let docs: Contifico[] | null;
    await axios(
      process.env.CONTIFICO_URI_DOCUMENT +
        '?tipo_registro=CLI&fecha_emision=' +
        date.toLocaleDateString('en-GB'),
      {
        method: 'GET',
        headers: { Authorization: process.env.CONTIFICO_AUTH_TOKEN },
      },
    )
      .then((res: AxiosResponse) => {
        return res.data;
      })
      .then((data) => {
        // console.log("Obteniendo documentos");
        docs = data;
      })
      .catch((err) => console.error(err));
    for (const doc of docs) {
      if (
        (doc.tipo_documento == 'FAC' && doc.electronico) ||
        doc.tipo_documento == 'PRE'
      ) {
        let existDocument = await this.commonService.checkDocument(
          doc.documento,
        );

        if (existDocument == null) {
          continue;
        }

        if (!existDocument) {
          // console.log("Guardando o actualizando cliente");
          const cliente = doc.persona;
          const dataAdicional1 = doc.adicional1.split('-');
          const costoEnvio = Number(dataAdicional1[0]);
          const canalVenta = dataAdicional1[1];
          let usuarioComprador = '';
          if (dataAdicional1[2] !== null || dataAdicional1[2] !== '') {
            usuarioComprador = dataAdicional1[2];
          }
          const formaPago = doc.adicional2;
          cliente['id'] = cliente.cedula || cliente.ruc;
          cliente['tipo_id'] = cliente.id.length == 10 ? 'CEDULA' : 'RUC';
          cliente['email'] = cliente.email.split(' ')[0];
          let idCiudadDestino: DocumentReference | number | null = 0;
          let idSucursalDestino: DocumentReference | number | null = 0;
          const total = Number(doc.total);
          let fechaEmision = null;
          if (doc.fecha_emision.split('/').length == 3) {
            fechaEmision = doc.fecha_emision.split('/');
            fechaEmision = new Date(
              fechaEmision[2],
              Number(fechaEmision[1]) - 1,
              fechaEmision[0],
            );
          }

          if (doc.referencia != '') {
            const destinos: string[] = doc.referencia.split('-');

            idCiudadDestino = !isNaN(Number(destinos[0]))
              ? Number(destinos[0])
              : null;

            if (destinos[1]) {
              idSucursalDestino = !isNaN(Number(destinos[1]))
                ? Number(destinos[1])
                : null;
            }

            if (destinos[2]) {
              cliente.direccion += ' - ' + destinos[2];
            }
          }

          const existClient = await this.saveClient(cliente);

          if (!existClient) {
            continue;
          }

          const clientRef = (
            await this.db
              .collection('clientes')
              .where('personaId', '==', cliente.id)
              .get()
          ).docs.map((client) => {
            return client.ref;
          });

          const ciudadRef = (
            await this.db
              .collection('ciudades')
              .where('codigo', '==', idCiudadDestino)
              .get()
          ).docs.map((ciudad) => {
            return ciudad.ref;
          });

          const sucursalRef = (
            await this.db
              .collection('sucursales')
              .where('codigo', '==', idSucursalDestino)
              .get()
          ).docs.map((client) => {
            return client.ref;
          });

          const document: DocumentosDB = {
            documento: doc.documento,
            estado: 1,
            urlRide: doc.url_ride,
            fechaEmision: fechaEmision != null ? fechaEmision : date,
            fechaCreacion: date,
            total: total,
            descripcion: doc.descripcion,
            idCliente: clientRef[0],
            idCiudadDestino: ciudadRef[0],
            idSucursalDestino: sucursalRef[0],
            idGuia: null,
            urlGuiaPDF: null,
            tipoDocumento: doc.tipo_documento,
            costoEnvio: costoEnvio,
            canalVenta: canalVenta,
            formaPago: formaPago,
            usuarioComprador: usuarioComprador,
          };
          existDocument = await this.saveDocument(document);
        }

        if (existDocument) {
          const documentoRef = (
            await this.db
              .collection('documentos')
              .where('documento', '==', doc.documento)
              .get()
          ).docs.map((document) => {
            return document.ref;
          });
          doc.ref = documentoRef[0];
          await this.saveDetalles(doc);
        }
      }
    }
  }

  /**
   * Guarda todos los detalles o productos de un documento en la base de datos
   * @param {Contifico} doc - Objeto Documento de la base de datos
   */
  async saveDetalles(doc: Contifico) {
    for (const detalle of doc.detalles) {
      let existDetalle: boolean = false;
      let hasError: boolean = false;

      try {
        const producto = (
          await this.db
            .collection('detalles_productos')
            .where('idDocumento', '==', doc.ref)
            .where('idProducto', '==', detalle.producto_id)
            .where('nombre', '==', detalle.producto_nombre)
            .where('precio', '==', Number(detalle.precio))
            .where('cantidad', '==', Number(detalle.cantidad))
            .where(
              'porcentajeDescuento',
              '==',
              Number(detalle.porcentaje_descuento),
            )
            .where('porcentajeIVA', '==', detalle.porcentaje_iva)
            .get()
        ).docs.map((product) => {
          return product.data();
        });

        if (producto.length > 0) {
          existDetalle = true;
        }

        if (!existDetalle) {
          detalle['id_documento'] = doc.ref;
          detalle['id_producto'] = detalle.producto_id;
          detalle['nombre'] = detalle.producto_nombre;
          detalle['precio'] = Number(detalle.precio);
          detalle['cantidad'] = Number(detalle.cantidad);
          detalle['porcentaje_descuento'] = Number(
            detalle.porcentaje_descuento,
          );

          delete detalle.producto_id;
          delete detalle.producto_nombre;

          await this.db
            .collection('detalles_productos')
            .add({
              idDocumento: detalle.id_documento,
              idProducto: detalle.id_producto,
              nombre: detalle.nombre,
              precio: detalle.precio,
              cantidad: detalle.cantidad,
              porcentajeDescuento: detalle.porcentaje_descuento,
              porcentajeIVA: detalle.porcentaje_iva,
            })
            // eslint-disable-next-line @typescript-eslint/no-unused-vars
            .then((_res) => {
              const msg =
                'Detalle del doc' +
                detalle.id_documento +
                ' guardado con éxito.';

              console.log(msg);
              // addlogToGlide(0, 1, msg, "");
            })
            .catch((err) => {
              const errorMsg =
                'Error al agregar el producto en la base de datos.';

              console.error(errorMsg);
              console.error(err);
              // addlogToGlide(1, 1, errorMsg, err.toString());
              hasError = true;
              throw new Error(err);
            });
        }
      } catch (error) {
        if (hasError) {
          continue;
        }
      }
    }
  }

  /**
   * Actualiza las ciudades en la base de datos.
   */
  async saveCities() {
    let cities: string | any[];
    let ciudad: DocumentReference;

    await axios(
      process.env.SERVICLI_URI_CIUDADES +
        "['" +
        process.env.SERVICLI_AUTH_USER +
        "','" +
        process.env.SERVICLI_AUTH_PASS +
        "']",
    )
      .then((res) => {
        cities = res.data;
      })
      .catch((err) => {
        console.error('Fallo al obtener las ciudades del API.');
        console.error(err);
      });

    if (cities.length == 1) {
      throw new Error('Fallo al obtener las ciudades del API.');
    }

    for (const city of cities) {
      const ciudades = (
        await this.db
          .collection('ciudades')
          .where('codigo', '==', city.id)
          .get()
      ).docs.map((ciudad) => {
        return ciudad.ref;
      });
      ciudad = ciudades[0];
      await ciudad
        .update({
          nombre: city.nombre,
        })
        .catch((err) => {
          console.error('Error al actualizar ciudades');
          throw err;
        });
    }
    console.log('Ciudades actualizadas');
  }

  /**
   * Guarda la tabla estado_documento con los valores inciales.
   */
  async saveStatusDocument() {
    const res = (await this.db.collection('estado_documento').get()).docs;

    if (res != null && res.length == 0) {
      await this.db
        .collection('estado_documento')
        .add({
          nombre: 'Pendiente',
          estadoNumber: 1,
        })
        .catch((err) => {
          console.error('Error al insertar ciudades');
          throw err;
        });
      await this.db
        .collection('estado_documento')
        .add({
          nombre: 'Procesado',
          estadoNumber: 2,
        })
        .catch((err) => {
          console.error('Error al insertar ciudades');
          throw err;
        });
      await this.db
        .collection('estado_documento')
        .add({
          nombre: 'Aprobado',
          estadoNumber: 3,
        })
        .catch((err) => {
          console.error('Error al insertar ciudades');
          throw err;
        });
      console.log('Estados de documento guardados');
    }
  }

  /**
   * Guarda las sucursales, provincias y ciudades en la base de datos.
   */
  async insertSucursales() {
    const res = (await this.db.collection('sucursales').get()).docs;
    let ciudad: DocumentReference;
    let provincia: DocumentReference;

    if (res != null && res.length == 0) {
      for (const sucursal of sucursales) {
        try {
          const provincias = (
            await this.db
              .collection('provincias')
              .where('nombre', '==', sucursal.provincia)
              .get()
          ).docs.map((provincia) => {
            return provincia.ref;
          });

          if (provincias.length > 0) {
            provincia = provincias[0];
          } else {
            provincia = this.db.collection('provincias').doc();
            await provincia.create({
              nombre: sucursal.provincia,
            });
          }

          const ciudades = (
            await this.db
              .collection('ciudades')
              .where('codigo', '==', sucursal.id_ciudad)
              .get()
          ).docs.map((ciudad) => {
            return ciudad.ref;
          });

          if (ciudades.length > 0) {
            ciudad = ciudades[0];
          } else {
            ciudad = this.db.collection('ciudades').doc();
            await ciudad.create({
              codigo: sucursal.id_ciudad,
              provincia: provincia,
            });
          }

          await this.db
            .collection('sucursales')
            .add({
              tipoCS: sucursal.tipo_cs,
              CS: sucursal.cs,
              direccion: sucursal.direccion,
              sector: sucursal.sector,
              telefono: sucursal.telefono,
              horaPromedioEntregaOficina:
                sucursal.hora_promedio_entrega_oficina,
              horarioLaboral: sucursal.horario_laboral,
              horarioFinSemana: sucursal.horario_fin_semana,
              email: sucursal.email,
              codigoPostal: sucursal.codigo_postal,
              CILResponsable: sucursal.cil_responsable,
              codigo: sucursal.id,
              idCiudad: ciudad,
              provincia: provincia,
            })
            .catch((err) => {
              console.error('Error al agregar las sucursales.');
              throw new Error(err);
            });
        } catch (error) {
          console.log(error);
          continue;
        }
      }
      console.log('Se agregaron las sucursales.');
    }
  }

  /**
   * Guarda un documento en la base de datos.
   * @param {DocumentosDB} document - Objeto documento a ser guardado
   * @return {boolean} True si se guardó o ya existe el documento en la base de datos
   */
  async saveDocument(document: DocumentosDB): Promise<boolean> {
    let existDocument = false;
    await this.db
      .collection('documentos')
      .add({
        estado: document.estado,
        urlRide: document.urlRide,
        fechaEmision: document.fechaEmision,
        fechaCreacion: document.fechaCreacion,
        total: document.total,
        descripcion: document.descripcion,
        idCliente: document.idCliente,
        idCiudadDestino: document.idCiudadDestino,
        idSucursalDestino: document.idSucursalDestino,
        urlGuiaPdf: document.urlGuiaPDF,
        tipoDocumento: document.tipoDocumento,
        costoEnvio: document.costoEnvio,
        canalVenta: document.canalVenta,
        usuarioComprador: document.usuarioComprador,
        formaPago: document.formaPago,
        documento: document.documento,
        idGuia: document.idGuia,
      })
      .then(() => {
        const msg = 'Documento ' + document.documento + ' guardado con éxito.';
        console.log(msg);
        // addlogToFirestore(0, 1, msg, "");
        existDocument = true;
      })
      .catch((err) => {
        const errorMsg = 'Fallo al insertar nuevo documento en la base';
        console.error(errorMsg);
        console.error(err);
        // addlogToFirestore(1, 1, errorMsg, err.toString());
      });
    //}
    return existDocument;
  }

  /**
   * Guarda el cliente en la base de datos
   * @param {Persona} cliente - Objeto cliente que será guardado
   * @return {boolean} True si existe o fué guardado con éxito
   */
  async saveClient(cliente: Persona): Promise<boolean> {
    let existClient: boolean = false;
    let oldDataClient: DocumentData[] | null = null;
    let updated: boolean = true;
    let hasError: boolean = false;
    try {
      oldDataClient = (
        await this.db
          .collection('clientes')
          .where('personaId', '==', cliente.id)
          .get()
      ).docs.map((client) => {
        return client.data();
      });
      if (oldDataClient.length > 0) {
        existClient = true;
      } else if (oldDataClient.length == 0) {
        existClient = false;
      } else {
        hasError = true;
        console.error('Error al consultar clientes de la base de datos.');
      }
      if (!hasError && existClient) {
        if (
          oldDataClient[0].telefonos != cliente.telefonos ||
          oldDataClient[0].direccion != cliente.direccion ||
          oldDataClient[0].tipo != cliente.tipo ||
          oldDataClient[0].email != cliente.email
        ) {
          const newClient: ClienteDB = {
            email: cliente.email,
            telefonos: cliente.telefonos,
            direccion: cliente.direccion,
            tipo: cliente.tipo,
            id: oldDataClient[0].id,
          };
          updated = await this.updateClient(newClient);
        }
      }

      if (hasError || !updated) {
        return false;
      }

      if (!existClient) {
        await this.db
          .collection('clientes')
          .add({
            personaId: cliente.id,
            tipoId: cliente.tipo_id,
            razonSocial: cliente.razon_social,
            telefonos: cliente.telefonos,
            direccion: cliente.direccion,
            tipo: cliente.tipo,
            email: cliente.email,
            otroDestinatario: null,
          })
          .then(() => {
            existClient = true;
            const msg = 'Cliente ' + cliente.id + ' guardado con éxito.';
            console.log(msg);
            // addlogToFirebase(0, 1, msg, "");
          })
          .catch(() => {
            const errorMsg =
              'Error al guardar cliente ' +
              cliente.id +
              ' en la base de datos.';

            console.error(errorMsg);
            // addlogToGlide(1, 1, errorMsg, err.toString());
          });
      }
      return existClient;
    } catch (error) {
      console.log(error);
      return false;
    }
  }

  /**
   * Actualiza un cliente con su respectivo id.
   * @param {ClienteDB} cliente - Objecto cliente con los campos a actualizar
   * @return {boolean} True si el documento se actualizó
   */
  async updateClient(cliente: ClienteDB): Promise<boolean> {
    let updated = false;
    try {
      await this.db
        .collection('clientes')
        .doc(cliente.id)
        .update({
          telefonos: cliente.telefonos,
          direccion: cliente.direccion,
          tipo: cliente.tipo,
          email: cliente.email,
        })
        .then(() => {
          console.log('Cliente ' + cliente.id + ' actualizado éxitosamente');
          updated = true;
        })
        .catch((err) => {
          console.log(err);
          throw err;
        });
    } catch (error) {
      const errorMsg =
        'Error al actualizar cliente ' + cliente.id + ' de la base de datos.';

      console.error(errorMsg);
      console.error(error);
    }
    return updated;
  }
  /**
   *
   * @param {string[]} params Parámetros a evaluar
   * @param {Request} event Request de la solicitud
   * @return {boolean} Retorna true si se encuentran todos los parámetros
   */
  async checkParams(params: string[], event: Request): Promise<boolean> {
    const reqParamList = event.body;
    const hasAllRequiredParams = params.every((param) =>
      reqParamList.hasOwnProperty(param),
    );
    return hasAllRequiredParams;
  }

  /**
   * Actualiza la ciudad o sucursal y establece si hay otro destinatario al documento indicado.
   * @param {string} id - Id del documento
   * @param {any} document - Objeto documento que contiene la ciudad y sucursal
   * @param {any} client - Objeto cliente con la información del destinatario
   * @return {boolean} Retorna true si fue actualizada el documento
   */
  async updateDocument(
    id: string,
    document: any,
    client: any,
  ): Promise<boolean> {
    let updated = false;
    await this.db
      .collection('documentos')
      .doc(id)
      .update({
        idSucursalDestino: document.id_sucursal_destino,
        idCiudadDestino: document.id_ciudad_destino,
        otroDestinatario: client,
      })
      .then(() => {
        updated = true;
      })
      .catch(() => {
        console.error('Error al actualizar documento ' + id);
        // addlogToGlide(1, 3, "Error al actualizar documento "+id, "" );
      });
    return updated;
  }
}
