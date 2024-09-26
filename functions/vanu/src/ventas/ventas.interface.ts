export interface VentasData {
  totalVentas: number;
  totalEnvios: number;
  ventasEnvios: number;
  envios: number;
  clientesAtendidos: number;
  pedidos: number;
  principalesDestinos: Record<string, number>;
  tiposEnvio: {
    agencia: number;
    domicilio: number;
  };
  canalesVenta: Record<string, { total: number; totalMoney: number }>;
}
