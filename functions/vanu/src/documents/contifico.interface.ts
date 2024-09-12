import { DocumentReference } from 'firebase-admin/firestore';

export interface Persona {
  id: DocumentReference | string | null;
  ruc: string | null;
  cedula: string | null;
  placa: string | null;
  razon_social: string | null;
  telefonos: string | null;
  direccion: string | null;
  tipo: string | null;
  es_cliente: boolean | null;
  es_proveedor: boolean | null;
  es_empleado: boolean | null;
  es_corporativo: boolean | null;
  aplicar_cupo: boolean | null;
  email: string | null;
  es_vendedor: boolean | null;
  es_extranjero: boolean | null;
  porcentaje_descuento: string | null;
  adicional1_cliente: string | null;
  adicional2_cliente: string | null;
  adicional3_cliente: string | null;
  adicional4_cliente: string | null;
  adicional1_proveedor: string | null;
  adicional2_proveedor: string | null;
  adicional3_proveedor: string | null;
  adicional4_proveedor: string | null;
  banco_codigo_id: string | null;
  tipo_cuenta: string | null;
  numero_tarjeta: string | null;
  personaasociada_id: string | null;
  nombre_comercial: string | null;
  origen: string | null;
  pvp_default: string | null;
  id_categoria: string | null;
  categoria_nombre: string | null;
  tipo_id: string | null;
}

interface Vendedor {
  ruc: string | null;
  cedula: string | null;
  razon_social: string | null;
  telefonos: string | null;
  direccion: string | null;
  tipo: string | null;
  email: string | null;
  es_extranjero: boolean | null;
}

interface Detalles {
  id_documento: DocumentReference | string | null;
  cuenta_id: string | null;
  centro_costo_id: string | null;
  id_producto: DocumentReference | string | null;
  producto_id: DocumentReference | string | null;
  producto_nombre: string | null;
  cantidad: string | number | null;
  nombre: string | null;
  precio: string | number | null;
  porcentaje_descuento: string | number | null;
  porcentaje_iva: number | null;
  porcentaje_ice: number | null;
  valor_ice: string | null;
  base_cero: string | null;
  base_gravable: string | null;
  base_no_gravable: string | null;
  serie: any;
  descripcion: string | null;
  color_id: string | null;
  formula: any[];
  formula_asociada: string | null;
  nombre_manual: string | null;
  peso: string | null;
  volumen: string | null;
  adicional1: string | null;
  codigo_bien: string | null;
  personas_asociadas: string | null;
  promocion_integracionId: string | null;
  ibpnr: string | null;
}

interface Cobros {
  forma_cobro: string | null;
  numero_comprobante: string | null;
  caja_id: string | null;
  monto: string | null;
  numero_tarjeta: string | null;
  fecha: string | null;
  nombre_tarjeta: string | null;
  tipo_banco: string | null;
  cuenta_bancaria_id: string | null;
  bin_tarjeta: string | null;
  monto_propina: string | null;
  numero_cheque: string | null;
  fecha_cheque: string | null;
  tipo_ping: string | null;
  id: string | null;
  lote: string | null;
}

export interface Contifico {
  ref: string | null;
  id: string | null;
  pos: string | null;
  fecha_creacion: string | null;
  fecha_emision: string | null;
  hora_emision: string | null;
  tipo_documento: string | null;
  tipo_registro: string | null;
  documento: string | null;
  estado: string | null;
  anulado: boolean | null;
  autorizacion: string | null;
  caja_id: string | null;
  persona_id: string | null;
  persona: Persona | null;
  vendedor: Vendedor | null;
  vendedor_id: string | null;
  vendedor_identificacion: string | null;
  descripcion: string | null;
  subtotal_0: string | null;
  subtotal_12: string | null;
  subtotal: string | null;
  iva: string | null;
  ice: string | null;
  servicio: string | null;
  total: string | null;
  saldo: string | null;
  saldo_anticipo: string | null;
  adicional1: string | null;
  adicional2: string | null;
  detalles: Detalles[] | null;
  cobros: Cobros[];
  documento_relacionado_id: string | null;
  reserva_relacionada: string | null;
  url_: string | null;
  tarjeta_consumo_id: string | null;
  url_ride: string | null;
  url_xml: string | null;
  referencia: string | null;
  entregado: boolean | null;
  electronico: boolean | null;
  logistica: boolean | null;
  fecha_vencimiento: string | null;
  tipo_descuento: string | null;
  placa: string | null;
  firmado: boolean | null;
  fecha_evento: string | null;
  hora_evento: string | null;
  direccion_evento: string | null;
  pax: number | null;
  tipo_domicilio: string | null;
  orden_domicilio_id: string | null;
}
