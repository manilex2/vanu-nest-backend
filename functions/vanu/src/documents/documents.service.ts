import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import axios, { AxiosResponse } from 'axios';
import { CommonService } from '../common/common.service';
import { Contifico, Persona } from './contifico.interface';
import { ClienteDB, DocumentosDB } from 'src/common/database.interface';
import {
  DocumentReference,
  Firestore,
  getFirestore,
  Timestamp,
  FieldValue,
  QuerySnapshot,
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

            const existClient = await this.saveClient(cliente, total);

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
              pagado: false,
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
            const documento = (
              await this.db
                .collection('documentos')
                .where('documento', '==', doc.documento)
                .get()
            ).docs.map((document) => {
              return document;
            });
            doc.ref = documento[0].ref;
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
    const mesActual = new Date().getMonth() + 1; // Mes actual (de 1 a 12)
    const añoActual = new Date().getFullYear(); // Año actual
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

          const productoRef: QuerySnapshot | DocumentReference = await this.db
            .collection('productos')
            .where('idProducto', '==', detalle.id_producto)
            .limit(1)
            .get();

          if (!productoRef.empty) {
            console.log(
              `Producto ${detalle.nombre} encontrado, actualizando registro...`,
            );

            try {
              // Actualizar el registro en la colección de productos para el mes actual y el año actual
              await this.actualizarRegistroProducto(
                detalle.id_producto,
                detalle.nombre,
                mesActual,
                añoActual,
                detalle.cantidad,
                detalle.precio,
              );
            } catch (error) {
              hasError = true;
              console.error(`Error en actualizarRegistroProducto: ${error}`);
              throw new Error(error);
            }
          } else {
            console.log(
              `Producto ${detalle.nombre} no encontrado, creando registro....`,
            );

            try {
              // Actualizar el registro en la colección de productos para el mes actual y el año actual
              await this.actualizarRegistroProducto(
                detalle.id_producto,
                detalle.nombre,
                mesActual,
                añoActual,
                detalle.cantidad,
                detalle.precio,
              );
            } catch (error) {
              hasError = true;
              console.error(`Error en actualizarRegistroProducto: ${error}`);
              throw new Error(error);
            }
          }

          await this.db
            .collection('detalles_productos')
            .add({
              idDocumento: detalle.id_documento,
              idProducto: detalle.id_producto,
              nombre: detalle.nombre,
              precio: detalle.precio,
              cantidad: detalle.cantidad,
              porcentajeDescuento: detalle.porcentaje_descuento / 100,
              porcentajeIVA: detalle.porcentaje_iva / 100,
            })
            // eslint-disable-next-line @typescript-eslint/no-unused-vars
            .then((_res) => {
              const msg =
                'Detalle del producto ' +
                detalle.id_producto +
                ' guardado con éxito.';

              console.log(msg);
              // addlogToFirebase(0, 1, msg, "");
            })
            .catch((err) => {
              const errorMsg =
                'Error al agregar el producto en la base de datos.';

              console.error(errorMsg);
              console.error(err);
              // addlogToFirebase(1, 1, errorMsg, err.toString());
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

  // Función para actualizar el registro en productos para el mes y año dados
  async actualizarRegistroProducto(
    productoId: string,
    productoNombre: string,
    mes: number,
    anio: number,
    cantidad: number,
    precio: number,
  ) {
    const productosUpdates = [
      { mes: mes, anio: anio }, // Mes actual
      { mes: 0, anio: anio }, // Año actual
      { mes: 0, anio: 0 }, // Consolidado total
    ];

    for (const update of productosUpdates) {
      const productoMesSnapshotNoDS = await this.db
        .collection('productos')
        .where('mes', '==', update.mes)
        .where('anio', '==', update.anio)
        .where('idProducto', '==', productoId)
        .where('ds', '==', false)
        .get();

      const productoMesSnapshotDS = await this.db
        .collection('productos')
        .where('mes', '==', update.mes)
        .where('anio', '==', update.anio)
        .where('idProducto', '==', productoId)
        .where('ds', '==', true)
        .get();

      if (!productoMesSnapshotNoDS.empty) {
        const doc = productoMesSnapshotNoDS.docs[0];
        await this.db
          .collection('productos')
          .doc(doc.id)
          .update({
            total: FieldValue.increment(cantidad),
            totalMoney: FieldValue.increment(precio),
          });
        console.log(
          `Registro actualizado para mes: ${update.mes}, año: ${update.anio}.`,
        );
      } else {
        // Si no existe un registro, se puede crear uno nuevo
        await this.db.collection('productos').add({
          idProducto: productoId,
          total: cantidad,
          totalMoney: precio,
          mes: update.mes,
          anio: update.anio,
          nombreProducto: productoNombre,
          ds: false,
        });
        console.log(
          `Nuevo registro creado para mes: ${update.mes}, año: ${update.anio}.`,
        );
      }

      if (!productoMesSnapshotDS.empty) {
        const doc = productoMesSnapshotDS.docs[0];
        await this.db
          .collection('productos')
          .doc(doc.id)
          .update({
            total: FieldValue.increment(cantidad),
            totalMoney: FieldValue.increment(precio),
          });
        console.log(
          `Registro actualizado para mes: ${update.mes}, año: ${update.anio}.`,
        );
      } else {
        // Si no existe un registro, se puede crear uno nuevo
        await this.db.collection('productos').add({
          idProducto: productoId,
          total: cantidad,
          totalMoney: precio,
          mes: update.mes,
          anio: update.anio,
          nombreProducto: productoNombre,
          ds: true,
        });
        console.log(
          `Nuevo registro creado para mes: ${update.mes}, año: ${update.anio}.`,
        );
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
      pagado: document.pagado,
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
   * @param {number} total - Total del dinero a guardar.
   * @return {boolean} True si existe o fué guardado con éxito
   */
  async saveClient(cliente: Persona, total: number): Promise<boolean> {
    let existClient = false;
    let hasError = false;

    try {
      const oldDataClient = (
        await this.db
          .collection('clientes')
          .where('personaId', '==', cliente.id)
          .get()
      ).docs.map((client) => client.data());

      // Si existe el cliente, comprueba si se deben actualizar sus datos
      if (oldDataClient.length > 0) {
        existClient = true;

        const clientData = oldDataClient[0];
        if (
          clientData.telefonos !== cliente.telefonosArray ||
          clientData.direccion !== cliente.direccion ||
          clientData.tipo !== cliente.tipo ||
          clientData.email !== cliente.email
        ) {
          const updatedClient: ClienteDB = {
            email: cliente.email,
            telefonos: cliente.telefonosArray,
            direccion: cliente.direccion,
            tipo: cliente.tipo,
            id: clientData.id,
            total: 1,
            totalMoney: total,
          };
          const updated = await this.updateClient(updatedClient);
          if (!updated) return false;
        } else {
          const updatedClient: ClienteDB = {
            id: clientData.id,
            total: 1,
            totalMoney: total,
          };
          const updated = await this.updateClientMoney(updatedClient);
          if (!updated) return false;
        }
      }

      // Si no existe el cliente, lo crea
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
            fechaCreacion: Timestamp.now(),
            nuevo: true,
            frecuente: false,
            total: FieldValue.increment(1),
            totalMoney: FieldValue.increment(total),
            totalMes: FieldValue.increment(1),
            totalMoneyMes: FieldValue.increment(total),
          })
          .then(async () => {
            console.log(`Cliente ${cliente.id} guardado con éxito.`);

            // Obtener mes y año actuales
            const mesActual = new Date().getMonth() + 1;
            const añoActual = new Date().getFullYear();

            // Actualizar las ventas para mes actual, año actual y consolidado total
            await this.actualizarVentasClientesNuevos(mesActual, añoActual, 1);
          })
          .catch((err) => {
            console.error(`Error al guardar cliente ${cliente.id}:`, err);
            hasError = true;
          });
      }

      return !hasError && existClient;
    } catch (error) {
      console.error('Error en saveClient:', error);
      return false;
    }
  }

  /**
   * @param {number} mesActual Mes actual en número
   * @param {number} añoActual Año actual en número
   * @param {number} incremento Cantidad a incrementar
   */
  // Función auxiliar para actualizar ventas
  async actualizarVentasClientesNuevos(
    mesActual: number,
    añoActual: number,
    incremento: number,
  ) {
    const ventasUpdates = [
      { mes: mesActual, año: añoActual }, // Mes actual
      { mes: 0, año: añoActual }, // Año actual
      { mes: 0, año: 0 }, // Consolidado total
    ];

    for (const update of ventasUpdates) {
      await this.db
        .collection('ventas')
        .where('mes', '==', update.mes)
        .where('anio', '==', update.año)
        .limit(1) // Asegura que obtienes un solo documento
        .get()
        .then(async (snapshot) => {
          if (!snapshot.empty) {
            const doc = snapshot.docs[0];
            await this.db
              .collection('ventas')
              .doc(doc.id)
              .update({
                clientesNuevos: FieldValue.increment(incremento),
              });
            console.log(
              `Actualizado clientesNuevos para mes: ${update.mes}, año: ${update.año}`,
            );
          }
        })
        .catch((err) => {
          console.error(
            `Error al actualizar ventas (mes: ${update.mes}, año: ${update.año}):`,
            err,
          );
          throw err;
        });
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
          total: FieldValue.increment(cliente.total),
          totalMoney: FieldValue.increment(cliente.totalMoney),
          totalMes: FieldValue.increment(cliente.total),
          totalMoneyMes: FieldValue.increment(cliente.totalMoney),
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
   * Actualiza el dinero total de un cliente con su respectivo id.
   * @param {ClienteDB} cliente - Objecto cliente con los campos a actualizar
   * @return {boolean} True si el documento se actualizó
   */
  async updateClientMoney(cliente: ClienteDB): Promise<boolean> {
    let updated = false;
    try {
      await this.db
        .collection('clientes')
        .doc(cliente.id)
        .update({
          total: FieldValue.increment(cliente.total),
          totalMoney: FieldValue.increment(cliente.totalMoney),
          totalMes: FieldValue.increment(cliente.total),
          totalMoneyMes: FieldValue.increment(cliente.totalMoney),
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
   * Actualizar el estatus de los clientes.
   * @return {string} Si los clientes se actualizaron
   */
  async updateClientStatus(): Promise<string> {
    let clientesActualizados = 0;
    try {
      const fechaLimite = new Date();
      fechaLimite.setMonth(fechaLimite.getMonth() - 1); // Calcula la fecha de hace un mes

      const mesActual = new Date().getMonth() + 1; // Mes actual (de 1 a 12)
      const añoActual = new Date().getFullYear(); // Año actual

      // Trae todos los clientes (sin importar el valor de 'nuevo')
      const clientesSnapshot = await this.db.collection('clientes').get();

      if (clientesSnapshot.empty) {
        console.log('No hay clientes para actualizar.');
        return 'No se actualizaron clientes.';
      }

      const batch = this.db.batch(); // Usamos un batch para realizar todas las actualizaciones en una sola operación

      // Itera sobre los clientes encontrados
      for (const doc of clientesSnapshot.docs) {
        const clienteRef = this.db.collection('clientes').doc(doc.id);
        const clienteData = doc.data();

        // Si el cliente es nuevo y su fecha de creación es menor a un mes, se actualiza a 'nuevo: false'
        if (
          clienteData.nuevo &&
          clienteData.fechaCreacion?.toDate() <= fechaLimite
        ) {
          batch.update(clienteRef, { nuevo: false });
          clientesActualizados++;
        }

        // Consultar la colección 'documentos' para obtener cuántos registros tiene el cliente para el mes actual
        const documentosSnapshot = await this.db
          .collection('documentos')
          .where('idCliente', '==', doc.id)
          .get();

        // Contar cuántos documentos tienen la fecha de emisión en el mes y año actual
        const documentosDelMesActual = documentosSnapshot.docs.filter((doc) => {
          const fechaEmision = doc.data().fechaEmision.toDate();
          return (
            fechaEmision.getMonth() + 1 === mesActual &&
            fechaEmision.getFullYear() === añoActual
          );
        });

        // Si el cliente tiene 3 o más documentos para el mes actual, se marca como 'frecuente: true'
        if (documentosDelMesActual.length >= 3) {
          if (!clienteData.frecuente) {
            // Si aún no es frecuente
            batch.update(clienteRef, { frecuente: true });
          }
        } else {
          // Si tiene menos de 3 documentos, se marca como 'frecuente: false'
          if (clienteData.frecuente) {
            // Si ya es frecuente
            batch.update(clienteRef, { frecuente: false });
          }
        }
      }

      // Ejecutar el batch para actualizar todos los clientes
      await batch.commit();
      console.log(`Clientes actualizados: ${clientesActualizados}`);

      // Actualizar las ventas para mes actual, año actual y consolidado total
      await this.actualizarVentasClientesNuevos(
        mesActual,
        añoActual,
        -clientesActualizados, // Restar los clientes actualizados
      );

      return `Actualizados ${clientesActualizados} clientes, actualizado el estado de frecuencia y ventas.`;
    } catch (error) {
      const errorMsg = 'Error al actualizar cliente de la base de datos.';
      console.error(errorMsg);
      console.error(error);
      return errorMsg;
    }
  }

  /**
   * Actualizar el estatus de los clientes el primer día del mes.
   * @return {string} Si los clientes se actualizaron
   */
  async updateClientMonth(): Promise<string> {
    let clientesActualizados = 0;
    try {
      const fechaLimite = new Date();
      fechaLimite.setMonth(fechaLimite.getMonth() - 1); // Calcula la fecha de hace un mes

      // Trae todos los clientes (sin importar el valor de 'nuevo')
      const clientesSnapshot = await this.db.collection('clientes').get();

      if (clientesSnapshot.empty) {
        console.log('No hay clientes para actualizar.');
        return 'No se actualizaron clientes.';
      }

      const batch = this.db.batch(); // Usamos un batch para realizar todas las actualizaciones en una sola operación

      // Itera sobre los clientes encontrados
      for (const doc of clientesSnapshot.docs) {
        const clienteRef = this.db.collection('clientes').doc(doc.id);

        batch.update(clienteRef, { totalMes: 0, totalMoneyMes: 0 });
        clientesActualizados++;
      }

      // Ejecutar el batch para actualizar todos los clientes
      await batch.commit();
      console.log(`Clientes actualizados: ${clientesActualizados}`);

      return `Actualizados ${clientesActualizados} clientes.`;
    } catch (error) {
      const errorMsg = 'Error al actualizar cliente de la base de datos.';
      console.error(errorMsg);
      console.error(error);
      return errorMsg;
    }
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
