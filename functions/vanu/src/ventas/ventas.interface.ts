export interface VentasData {
  totalVentas: number;
  totalEnvios: number;
  ventasEnvios: number;
  envios: number;
  clientesAtendidos: number;
  pedidos: number;
  principalesDestinos: Array<{ destino: string; total: number }>;
  tiposEnvio: { agencia: number; domicilio: number; desconocido: number };
  canalesVenta: Array<{
    canal: string;
    total: number;
    totalMoney: number;
  }>;
}
