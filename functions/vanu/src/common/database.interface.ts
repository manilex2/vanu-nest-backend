import { DocumentReference } from 'firebase-admin/firestore';

export interface DocumentosDB {
  id?: string;
  estado: number;
  urlRide: string;
  fechaEmision: Date;
  fechaCreacion: Date;
  total: number;
  descripcion: string;
  idCliente: DocumentReference | null;
  idCiudadDestino: DocumentReference | null;
  idSucursalDestino: DocumentReference | null;
  urlGuiaPDF: string;
  tipoDocumento: string;
  costoEnvio: number;
  canalVenta: string;
  usuarioComprador: string;
  formaPago: string;
  idGuia: string;
  documento: string;
}

export interface ClienteDB {
  id?: string;
  tipoId?: string;
  razonSocial?: string;
  telefonos: string[];
  direccion: string;
  tipo: string;
  email: string;
  personaId?: string;
}

export interface CitiesDB {
  nombre: string | null;
  codigo: number | null;
  provinciaId: DocumentReference | null;
}
