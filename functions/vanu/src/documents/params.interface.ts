export interface ParamsDTO {
  body: Body;
}

interface Body {
  id: string | null;
  id_ciudad: string | null;
  id_sucursal: string | null;
  id_cliente: string | null;
  razon_social: string | null;
  telefonos: string | null;
  direccion: string | null;
  tipo: string | null;
  email: string | null;
  tipo_id: string | null;
}
