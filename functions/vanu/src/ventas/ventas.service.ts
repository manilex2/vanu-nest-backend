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
        return 'No hay documentos para actualizar';
      }

      // Definir la estructura de ventasData utilizando la interfaz
      const ventasData: Record<string, VentasData> = {};

      for (const doc of documentos) {
        const fechaEmision = doc.fechaEmision.toDate();
        const month = fechaEmision.getMonth() + 1; // Mes en formato numérico
        const mesKey = `${year}-${month}`;

        if (!ventasData[mesKey]) {
          ventasData[mesKey] = {
            totalVentas: 0,
            totalEnvios: 0,
            ventasEnvios: 0,
            envios: 0,
            clientesAtendidos: 0,
            pedidos: 0,
            principalesDestinos: [],
            tiposEnvio: { agencia: 0, domicilio: 0 },
            canalesVenta: [],
          };
        }

        const venta = ventasData[mesKey];
        venta.totalVentas += doc.total || 0;
        venta.totalEnvios += doc.costoEnvio || 0;
        venta.ventasEnvios += (doc.total || 0) + (doc.costoEnvio || 0);

        if (doc.costoEnvio) venta.envios += 1;
        if (doc.idCliente) venta.clientesAtendidos += 1;
        venta.pedidos += 1;

        // Actualizar principales destinos
        if (doc.idCiudadDestino) {
          const ciudadRef = doc.idCiudadDestino;
          const ciudadSnapshot = await ciudadRef.get();
          const ciudadData = ciudadSnapshot.data();
          const ciudadNombre = ciudadData?.nombre || 'Desconocido';

          const destinoIndex = venta.principalesDestinos.findIndex(
            (destino) => destino.destino === ciudadNombre,
          );

          if (destinoIndex === -1) {
            // Si no existe el destino, lo agregamos
            venta.principalesDestinos.push({ destino: ciudadNombre, total: 1 });
          } else {
            // Si ya existe, solo incrementamos el total
            venta.principalesDestinos[destinoIndex].total += 1;
          }
        }

        // Actualizar tipos de envío
        if (doc.idSucursalDestino) {
          venta.tiposEnvio.agencia += 1;
        } else {
          venta.tiposEnvio.domicilio += 1;
        }

        const canal = doc.canalVenta || 'Desconocido';
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

      // Guardar o actualizar los resultados en la colección "ventas"
      for (const [mesKey, data] of Object.entries(ventasData)) {
        const [year, month] = mesKey.split('-');
        const mesLabel = now
          .set({ month: parseInt(month) })
          .toLocaleString({ month: 'long' }, { locale: 'es' });

        // Verificar si ya existe un documento en la colección ventas para ese mes y año
        const ventasSnapshot = await this.ventasCollection
          .where('anio', '==', parseInt(year))
          .where('mes', '==', parseInt(month))
          .get();

        if (!ventasSnapshot.empty) {
          // Si existe, actualizar el documento
          const docId = ventasSnapshot.docs[0].id; // Obtener el ID del primer documento
          await this.ventasCollection.doc(docId).update({
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
              { destino: 'Retiro en agencia', total: data.tiposEnvio.agencia },
              {
                destino: 'Envios a domicilio',
                total: data.tiposEnvio.domicilio,
              },
            ],
            canalesVenta: data.canalesVenta.map(
              ({ canal, total, totalMoney }) => ({
                canal, // canal como valor del objeto
                total,
                totalMoney,
              }),
            ),
            mes: parseInt(month),
            anio: parseInt(year),
            mesLabel: mesLabel.charAt(0).toUpperCase() + mesLabel.slice(1),
          });
        } else {
          // Si no existe, crear un nuevo documento con ID automático
          await this.ventasCollection.add({
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
              { destino: 'Retiro en agencia', total: data.tiposEnvio.agencia },
              {
                destino: 'Envios a domicilio',
                total: data.tiposEnvio.domicilio,
              },
            ],
            canalesVenta: data.canalesVenta.map(
              ({ canal, total, totalMoney }) => ({
                canal, // canal como valor del objeto
                total,
                totalMoney,
              }),
            ),
            mes: parseInt(month),
            anio: parseInt(year),
            mesLabel: mesLabel.charAt(0).toUpperCase() + mesLabel.slice(1),
          });
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
}
