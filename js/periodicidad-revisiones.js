/* Periodicidades de la tabla facilitada para revisiones de puertas. */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.PeriodicidadRevisiones = api;
})(typeof window !== 'undefined' ? window : null, function () {
  'use strict';

  function numeroNoNegativo(valor, nombre) {
    if (typeof valor !== 'number' || !Number.isInteger(valor) || valor < 0) {
      throw new TypeError(nombre + ' debe ser un número entero no negativo');
    }
    return valor;
  }

  function meses(criterios) {
    if (!criterios || typeof criterios !== 'object') {
      throw new TypeError('Indica los criterios de uso de la puerta');
    }
    switch (criterios.uso) {
      case 'garaje_residencial':
        if (typeof criterios.estacional !== 'boolean') {
          throw new TypeError('Indica si el uso es estacional');
        }
        if (criterios.estacional) return 12;
        {
          const vehiculos = numeroNoNegativo(criterios.vehiculos, 'El número de vehículos');
          return vehiculos <= 5 ? 12 : vehiculos <= 50 ? 6 : 4;
        }
      case 'industrial':
        if (typeof criterios.rapida !== 'boolean') {
          throw new TypeError('Indica si la puerta industrial es rápida');
        }
        return criterios.rapida ? 4 : 6;
      case 'comercial':
        if (typeof criterios.enrollable !== 'boolean') {
          throw new TypeError('Indica si la puerta comercial es enrollable');
        }
        if (criterios.enrollable) return 12;
        return numeroNoNegativo(criterios.ciclosDia, 'El número de ciclos al día') <= 10 ? 6 : 4;
      default:
        throw new TypeError('Indica un uso válido: garaje/residencial, industrial o comercial');
    }
  }

  function proximaRevision(fecha, criterios) {
    const frecuencia = meses(criterios);
    const match = typeof fecha === 'string' && /^(\d{4})-(\d{2})-(\d{2})$/.exec(fecha);
    if (!match) throw new TypeError('La fecha debe tener formato AAAA-MM-DD');
    const year = Number(match[1]);
    const month = Number(match[2]);
    const day = Number(match[3]);
    const origen = new Date(Date.UTC(year, month - 1, day));
    if (year < 100 || origen.getUTCFullYear() !== year ||
        origen.getUTCMonth() !== month - 1 || origen.getUTCDate() !== day) {
      throw new TypeError('La fecha de revisión no es válida');
    }
    const destino = new Date(Date.UTC(year, month - 1 + frecuencia, 1));
    const ultimoDia = new Date(Date.UTC(destino.getUTCFullYear(), destino.getUTCMonth() + 1, 0)).getUTCDate();
    destino.setUTCDate(Math.min(day, ultimoDia));
    return destino.toISOString().slice(0, 10);
  }

  return { meses, proximaRevision };
});
