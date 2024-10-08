import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import axios, { AxiosResponse } from 'axios';
import { CommonService } from '../common/common.service';
import { Contifico, Persona } from './contifico.interface';
import { ClienteDB, DocumentosDB } from 'src/common/database.interface';
import {
  DocumentData,
  DocumentReference,
  Firestore,
  getFirestore,
  Timestamp,
} from 'firebase-admin/firestore';
import sucursales from '../common/sucursales.json';
import { ConfigService } from '@nestjs/config';
import { ParamsDTO } from './params.interface';

@Injectable()
export class DocumentsService {
  constructor(
    private commonService: CommonService,
    private configService: ConfigService,
  ) {}

  db: Firestore = getFirestore();

  /**
   * Guarda los documentos nuevos en la base de datos.
   */
  async saveDocuments() {
    let date: number | Date = Date.now();
    date = new Date(date - 5 * 1000 * 60 * 60);
    let docs: Contifico[] | null;
    try {
      await axios(
        this.configService.get<string>('CONTIFICO_URI_DOCUMENT') +
          '?tipo_registro=CLI&fecha_emision=' +
          date.toLocaleDateString('en-GB'),
        {
          method: 'GET',
          headers: {
            Authorization: this.configService.get<string>(
              'CONTIFICO_AUTH_TOKEN',
            ),
          },
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
      if (docs.length < 1) {
        console.log('No hay documentos para agregar');
      }
      for (const doc of docs) {
        if (
          (doc.tipo_documento == 'FAC' && doc.electronico) ||
          doc.tipo_documento == 'PRE'
        ) {
          console.log(doc);
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
            const canalVenta =
              dataAdicional1[1] !== undefined ? dataAdicional1[1] : null;
            let usuarioComprador = null;
            if (
              dataAdicional1[2] !== null &&
              dataAdicional1[2] !== '' &&
              dataAdicional1[2] !== undefined
            ) {
              usuarioComprador = dataAdicional1[2];
            }
            const formaPago = doc.adicional2;
            cliente['id'] = cliente.cedula || cliente.ruc;
            cliente['tipo_id'] = cliente.id.length == 10 ? 'CEDULA' : 'RUC';
            cliente['email'] = cliente.email.split(' ')[0];
            const cli = cliente.telefonos ? cliente.telefonos.split('/') : null;
            cliente['telefonosArray'] = cli;
            let idCiudadDestino: DocumentReference | number | null = null;
            let idSucursalDestino: DocumentReference | number | null = null;
            const total = Number(doc.total);
            let fechaEmision: any = null;
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
                .where('codigo', '==', Number(idCiudadDestino))
                .get()
            ).docs.map((ciudad) => {
              return ciudad.ref;
            });

            const sucursalRef = (
              await this.db
                .collection('sucursales')
                .where('codigo', '==', Number(idSucursalDestino))
                .get()
            ).docs.map((sucursal) => {
              return sucursal.ref;
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
              idCiudadDestino:
                idCiudadDestino != null && idCiudadDestino != 0
                  ? ciudadRef[0]
                  : null,
              idSucursalDestino:
                idSucursalDestino != null && idSucursalDestino != 0
                  ? sucursalRef[0]
                  : null,
              idGuia: null,
              urlGuiaPDF: null,
              tipoDocumento: doc.tipo_documento,
              costoEnvio: costoEnvio,
              canalVenta: canalVenta,
              formaPago: formaPago,
              usuarioComprador: usuarioComprador,
            };
            // Eliminar campos que sean null o ''
            Object.entries(document).forEach(([key, value]) => {
              if (value === null || value === '') {
                delete document[key as keyof DocumentosDB];
              }
            });
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
    } catch (error) {
      console.log(error);
      throw new HttpException(
        `Ocurrio el siguiente error: ${error}`,
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
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
            .where('porcentajeIVA', '==', Number(detalle.porcentaje_iva))
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
          detalle['porcentaje_iva'] = Number(detalle.porcentaje_iva);

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
                'Detalle del producto ' +
                detalle.id_producto +
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

    const citiesWithoutName = (
      await this.db.collection('ciudades').get()
    ).docs.filter(
      (doc) => doc.data().nombre === null || doc.data().nombre === undefined,
    );

    if (citiesWithoutName.length <= 1) {
      console.log('No hay ciudades para actualizar');
      return;
    }

    await axios(
      this.configService.get<string>('SERVICLI_URI_CIUDADES') +
        "['" +
        this.configService.get<string>('SERVICLI_AUTH_USER') +
        "','" +
        this.configService.get<string>('SERVICLI_AUTH_PASS') +
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
          .where('codigo', '==', Number(city.id))
          .get()
      ).docs.map((ciudad) => {
        return ciudad;
      });
      if (
        ciudades.length < 1 ||
        ciudades[0].data().nombre ||
        ciudades[0].data().nombre != null
      ) {
        continue;
      }
      ciudad = ciudades[0].ref;
      await ciudad
        .update({
          nombre: city.nombre,
        })
        .catch((err) => {
          console.error('Error al actualizar ciudades');
          throw err;
        });
    }
    const citiesWithoutNameAfter = (
      await this.db.collection('ciudades').get()
    ).docs.filter(
      (doc) => doc.data().nombre === null || doc.data().nombre === undefined,
    );
    for (const city of citiesWithoutNameAfter) {
      if (!city.data().codigo) {
        continue;
      }
      await ciudad
        .update({
          nombre: String(city.data().codigo),
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
          console.error('Error al insertar estados de documentos');
          throw err;
        });
      await this.db
        .collection('estado_documento')
        .add({
          nombre: 'Procesado',
          estadoNumber: 2,
        })
        .catch((err) => {
          console.error('Error al insertar estados de documentos');
          throw err;
        });
      await this.db
        .collection('estado_documento')
        .add({
          nombre: 'Aprobado',
          estadoNumber: 3,
        })
        .catch((err) => {
          console.error('Error al insertar estados de documentos');
          throw err;
        });
      await this.db
        .collection('estado_documento')
        .add({
          nombre: 'Eliminado',
          estadoNumber: 4,
        })
        .catch((err) => {
          console.error('Error al insertar estados de documentos');
          throw err;
        });
      console.log('Estados de documento guardados');
    } else {
      console.log('No hay estados de documento por guardar.');
    }
  }

  /**
   * Guarda las sucursales, provincias y ciudades en la base de datos.
   */
  async insertSucursales() {
    const res = (await this.db.collection('sucursales').get()).docs;
    let ciudad: DocumentReference | void;
    let provincia: DocumentReference | void;

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
            provincia = await this.db
              .collection('provincias')
              .add({
                nombre: sucursal.provincia,
              })
              .catch((err) => {
                console.error(
                  `No pudo agregar la provincia de nombre ${sucursal.provincia} por: ${err}`,
                );
              });
          }

          const ciudades = (
            await this.db
              .collection('ciudades')
              .where('codigo', '==', Number(sucursal.id_ciudad))
              .get()
          ).docs.map((ciudad) => {
            return ciudad.ref;
          });

          if (ciudades.length > 0) {
            ciudad = ciudades[0];
          } else {
            ciudad = await this.db
              .collection('ciudades')
              .add({
                codigo: Number(sucursal.id_ciudad) || null,
                provinciaId: provincia,
              })
              .catch((err) => {
                console.error(
                  `No pudo agregar la ciudad de codigo ${sucursal.id_ciudad} por: ${err}`,
                );
              });
          }

          await this.db
            .collection('sucursales')
            .add({
              tipoCS: sucursal.tipo_cs,
              CS: sucursal.cs,
              direccion: sucursal.direccion,
              sector: sucursal.sector == 'null' ? null : sucursal.sector,
              telefono: sucursal.telefono,
              horaPromedioEntregaOficina:
                sucursal.hora_promedio_entrega_oficina == 'null'
                  ? null
                  : sucursal.hora_promedio_entrega_oficina,
              horarioLaboral: sucursal.horario_laboral,
              horarioFinSemana:
                sucursal.horario_fin_semana == 'null'
                  ? null
                  : sucursal.horario_fin_semana,
              email: sucursal.email,
              codigoPostal: sucursal.codigo_postal,
              CILResponsable: sucursal.cil_responsable,
              codigo: Number(sucursal.id) || null,
              idCiudad: ciudad,
              provincia: provincia,
            })
            .catch((err) => {
              console.error(
                `No pudo agregar la sucursal de codigo ${sucursal.id} por: ${err}`,
              );
            });
        } catch (error) {
          console.log(error);
          continue;
        }
      }
      console.log('Sucursales, ciudades y provincias agregadas correctamente');
    } else {
      console.log('No hay sucursales por agregar');
    }
  }

  /**
   * Guarda un documento en la base de datos.
   * @param {DocumentosDB} document - Objeto documento a ser guardado
   * @return {boolean} True si se guardó o ya existe el documento en la base de datos
   */
  async saveDocument(document: DocumentosDB): Promise<boolean> {
    let existDocument = false;
    const documentData = {
      estado: document.estado,
      urlRide: document.urlRide,
      fechaEmision: document.fechaEmision
        ? Timestamp.fromDate(document.fechaEmision)
        : undefined,
      fechaCreacion: document.fechaCreacion
        ? Timestamp.fromDate(document.fechaCreacion)
        : undefined,
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
    };
    // Filtrar las propiedades que no sean undefined
    const filteredDocumentData = Object.fromEntries(
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      Object.entries(documentData).filter(([_, value]) => value !== undefined),
    );
    await this.db
      .collection('documentos')
      .add(filteredDocumentData)
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
          oldDataClient[0].telefonos != cliente.telefonosArray ||
          oldDataClient[0].direccion != cliente.direccion ||
          oldDataClient[0].tipo != cliente.tipo ||
          oldDataClient[0].email != cliente.email
        ) {
          const newClient: ClienteDB = {
            email: cliente.email,
            telefonos: cliente.telefonosArray,
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
            telefonos: cliente.telefonosArray,
            direccion: cliente.direccion,
            tipo: cliente.tipo,
            email: cliente.email,
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
   * @param {ParamsDTO} body Body de la solicitud
   * @return {boolean} Retorna true si se encuentran todos los parámetros
   */
  async checkParams(params: string[], body: ParamsDTO): Promise<boolean> {
    const reqParamList = body;
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
    const formatedValue = {
      idSucursalDestino: document.idSucursalDestino,
      idCiudadDestino: document.idCiudadDestino,
      costoEnvio: document.costoEnvio,
      otroDestinatario: client,
    };

    Object.entries(formatedValue).forEach(([key, value]) => {
      if (value === null || value === '') {
        delete formatedValue[key];
      }
    });
    if (formatedValue.otroDestinatario) {
      formatedValue.otroDestinatario = {
        ...formatedValue.otroDestinatario,
        tipoId: document.tipoId,
      };
    }
    await this.db
      .collection('documentos')
      .doc(id)
      .update(formatedValue)
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
