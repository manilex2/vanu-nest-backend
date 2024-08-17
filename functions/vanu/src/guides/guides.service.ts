import { Injectable } from '@nestjs/common';
import { Request } from 'express';

@Injectable()
export class GuidesService {
  checkParams(params: string[], req: Request): boolean {
    if (req.query) {
      const reqParamList: string[] = Object.keys(req.query);
      const hasAllRequiredParams: boolean = params.every((param) =>
        reqParamList.includes(param),
      );
      return hasAllRequiredParams;
    }
    return false;
  }

  /**
   * Valida si la fecha se encuentra en el formato correcto.
   * Tratará de formaterala de forma correcta
   * @param {string} fecha - Fecha para consultar el manifiesto
   * @return {string} La fecha en el formato correcto o null.
   */
  validateDate(fecha: string): string {
    const regex = new RegExp(
      /^(2\d\d\d)-(0[1-9]|1[0-2])-(0[1-9]|1\d|2\d|3[0-1])$/,
    );
    if (!regex.test(fecha)) {
      const parts = fecha.split('-');
      for (let i = 0; i < parts.length; i++) {
        if (parts[i].length == 1) {
          parts[i] = '0' + parts[i];
        }
      }
      fecha = parts.join('-');

      if (!regex.test(fecha)) {
        return null;
      }
    }

    return fecha;
  }
}
