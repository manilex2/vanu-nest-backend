import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import {
  FirebaseFirestoreError,
  getFirestore,
  Timestamp,
} from 'firebase-admin/firestore';
import { DateTime } from 'luxon'; // Para manejar fechas en español
import { VentasData } from './ventas.interface';

@Injectable()
export class VentasService {
  constructor() {}
  private db = getFirestore();
  private ventasCollection = this.db.collection('ventas');
  private documentosCollection = this.db.collection('documentos');

  async actualizarVentasDelAnio(): Promise<string> {
    // Obtener la fecha actual para el año y el mes actuales
    const now = DateTime.now();
    const year = now.year;

    try {
      // Filtrar los documentos del año actual
      const documentosSnapshot = await this.documentosCollection
        .where(
          'fechaEmision',
          '>=',
          Timestamp.fromDate(new Date(`${year}-01-01`)),
        )
        .where(
          'fechaEmision',
          '<',
          Timestamp.fromDate(new Date(`${year + 1}-01-01`)),
        )
        .get();

      const documentos = documentosSnapshot.docs.map((doc) => doc.data());

      if (documentos.length === 0) {
        return 'No hay documentos para actualizar las ventas';
      }

      // Definir la estructura de ventasData utilizando la interfaz
      const ventasData: Record<
        string,
        VentasData & { clientesUnicos: Set<string> }
      > = {};

      for (const doc of documentos) {
        const fechaEmision = doc.fechaEmision.toDate();
        const month = fechaEmision.getMonth() + 1; // Mes en formato numérico
        const mesKeys = [
          `${year}-${month}`, // Por mes
          `${year}-0`, // Por año
          `0-0`, // Consolidado
        ];

        // Obtener datos de la ciudad si es necesario
        let ciudadNombre = 'Desconocido';
        if (doc.idCiudadDestino) {
          const ciudadRef = doc.idCiudadDestino;
          const ciudadSnapshot = await ciudadRef.get();
          const ciudadData = ciudadSnapshot.data();
          ciudadNombre = ciudadData?.nombre || 'Desconocido';
        }

        // Determinar tipoEnvioKey
        let tipoEnvioKey: string;
        if (doc.idSucursalDestino) {
          tipoEnvioKey = 'agencia';
        } else if (doc.idCiudadDestino) {
          tipoEnvioKey = 'domicilio';
        } else {
          tipoEnvioKey = 'desconocido';
        }

        const canal = doc.canalVenta || 'Desconocido';

        for (const mesKey of mesKeys) {
          if (!ventasData[mesKey]) {
            ventasData[mesKey] = {
              totalVentas: 0,
              totalEnvios: 0,
              ventasEnvios: 0,
              envios: 0,
              clientesAtendidos: 0,
              clientesNuevos: 0,
              pedidos: 0,
              principalesDestinos: [],
              tiposEnvio: { agencia: 0, domicilio: 0, desconocido: 0 },
              canalesVenta: [],
              clientesUnicos: new Set(), // Inicializa el Set para clientes únicos
            };
          }

          const venta = ventasData[mesKey];

          venta.clientesNuevos =
            (
              await this.db
                .collection('clientes')
                .where('nuevo', '==', true)
                .get()
            ).docs.length || 0;

          // Siempre incrementar 'pedidos'
          venta.pedidos += 1;

          // Verificar si el cliente ya ha sido contado
          if (doc.idCliente && !venta.clientesUnicos.has(doc.idCliente)) {
            venta.clientesAtendidos += 1; // Solo suma si es un cliente único
            venta.clientesUnicos.add(doc.idCliente); // Agrega el cliente al Set
          }

          // Sumar solo si 'doc.canalVenta' no es 'DS'
          if (doc.canalVenta !== 'DS') {
            venta.totalVentas += doc.total || 0;
            venta.totalEnvios += doc.costoEnvio || 0;
            venta.ventasEnvios += (doc.total || 0) + (doc.costoEnvio || 0);

            if (doc.costoEnvio || doc.costoEnvio != 0) venta.envios += 1;
          }

          // Actualizar principalesDestinos
          if (ciudadNombre) {
            const destinoIndex = venta.principalesDestinos.findIndex(
              (destino) => destino.destino === ciudadNombre,
            );

            if (destinoIndex === -1) {
              // Si no existe el destino, lo agregamos
              venta.principalesDestinos.push({
                destino: ciudadNombre,
                total: 1,
              });
            } else {
              // Si ya existe, solo incrementamos el total
              venta.principalesDestinos[destinoIndex].total += 1;
            }
          }

          // Actualizar tipos de envío
          venta.tiposEnvio[tipoEnvioKey] += 1;

          // Actualizar canalesVenta
          const canalIndex = venta.canalesVenta.findIndex(
            (c) => c.canal === canal,
          );

          if (canalIndex === -1) {
            // Si no existe, agregar nuevo canal
            venta.canalesVenta.push({
              canal,
              total: 1,
              totalMoney: doc.total || 0,
            });
          } else {
            // Si existe, solo actualizar el total y el totalMoney
            venta.canalesVenta[canalIndex].total += 1;
            venta.canalesVenta[canalIndex].totalMoney += doc.total || 0;
          }
        }
      }

      // Guardar o actualizar los resultados en la colección "ventas"
      for (const [mesKey, data] of Object.entries(ventasData)) {
        const [yearStr, monthStr] = mesKey.split('-');
        const anio = parseInt(yearStr);
        const mes = parseInt(monthStr);

        let mesLabel = '';

        if (mes === 0 && anio === 0) {
          mesLabel = 'Consolidado';
        } else if (mes === 0) {
          mesLabel = 'Anual';
        } else {
          mesLabel = now
            .set({ month: mes })
            .setLocale('es')
            .toLocaleString({ month: 'long' });
          mesLabel = mesLabel.charAt(0).toUpperCase() + mesLabel.slice(1);
        }

        // Verificar si ya existe un documento en la colección ventas para ese mes y año
        const ventasSnapshot = await this.ventasCollection
          .where('anio', '==', anio)
          .where('mes', '==', mes)
          .get();

        const ventasDataToSave = {
          totalVentas: data.totalVentas,
          totalEnvios: data.totalEnvios,
          ventasEnvios: data.ventasEnvios,
          envios: data.envios,
          clientesAtendidos: data.clientesAtendidos,
          pedidos: data.pedidos,
          principalesDestinos: data.principalesDestinos.map(
            ({ destino, total }) => ({
              destino,
              total,
            }),
          ),
          tiposEnvio: [
            { tipo: 'Retiro en agencia', total: data.tiposEnvio.agencia },
            { tipo: 'Envíos a domicilio', total: data.tiposEnvio.domicilio },
            { tipo: 'Desconocido', total: data.tiposEnvio.desconocido },
          ],
          canalesVenta: data.canalesVenta.map(
            ({ canal, total, totalMoney }) => ({
              canal, // canal como valor del objeto
              total,
              totalMoney,
            }),
          ),
          mes: mes,
          anio: anio,
          mesLabel,
        };

        if (!ventasSnapshot.empty) {
          // Si existe, actualizar el documento
          const docId = ventasSnapshot.docs[0].id; // Obtener el ID del primer documento
          await this.ventasCollection.doc(docId).update(ventasDataToSave);
        } else {
          // Si no existe, crear un nuevo documento con ID automático
          await this.ventasCollection.add(ventasDataToSave);
        }
      }

      return 'Ventas actualizadas exitosamente';
    } catch (error) {
      console.log(error);
      if (error instanceof FirebaseFirestoreError) {
        throw new HttpException(
          `Hubo el siguiente error ${error.message}`,
          HttpStatus.INTERNAL_SERVER_ERROR,
        );
      }
      throw new HttpException(
        `Hubo el siguiente error ${error}`,
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  async actualizarMesAnioInst(): Promise<string> {
    const institutionRef = (
      await this.db.collection('institution').get()
    ).docs.map((inst) => {
      return inst.ref;
    });

    // Obtener el mes y año actual
    const fechaActual = new Date();
    const mesActual = fechaActual.getMonth() + 1; // Los meses en JavaScript son base 0, así que sumamos 1
    const anioActual = fechaActual.getFullYear();

    // Actualizar el documento
    try {
      await institutionRef[0]
        .update({
          mesActual: mesActual,
          anioActual: anioActual,
        })
        .catch((err) => {
          throw new HttpException(err, HttpStatus.INTERNAL_SERVER_ERROR);
        });
      console.log('Registro de institución actualizado correctamente');
      return 'Se actualizo correctamente el mes y año de la institución';
    } catch (error) {
      console.error('Error actualizando el registro:', error);
      if (error instanceof FirebaseFirestoreError) {
        throw new HttpException(
          `Hubo el siguiente error ${error.message}`,
          HttpStatus.INTERNAL_SERVER_ERROR,
        );
      }
      throw new HttpException(
        `Hubo el siguiente error ${error}`,
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }
}
