import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

function cargarExportador(datos) {
  const descargas = [];
  const avisos = [];
  class BlobPrueba {
    constructor(partes) { this.partes = partes; }
    text() { return Promise.resolve(this.partes.join('')); }
  }
  const entorno = {
    Blob: BlobPrueba,
    URL: {
      createObjectURL(blob) { descargas.push(blob); return 'blob:prueba'; },
      revokeObjectURL() {}
    },
    document: {
      body: { appendChild() {} },
      createElement() { return { click() {}, remove() {} }; },
      getElementById() { return null; }
    },
    setTimeout(callback) { callback(); },
    window: {
      isAdmin: () => true,
      dbGetAll: async tabla => datos[tabla] || [],
      showToast: (mensaje, tipo) => avisos.push({ mensaje, tipo })
    }
  };
  entorno.window.window = entorno.window;
  vm.createContext(entorno);
  vm.runInContext(
    fs.readFileSync(new URL('../js/exportar-contabilidad.js', import.meta.url), 'utf8'),
    entorno,
    { filename: 'exportar-contabilidad.js' }
  );
  return { entorno, descargas, avisos };
}

test('exporta albaranes firmados con precio y referencia del presupuesto aprobado', async () => {
  const { entorno, descargas, avisos } = cargarExportador({
    clientes: [{
      id: 'cliente-1', sageCodigo: 'C001', dni: '12345678Z', nombre: 'Cliente Uno',
      direccion: 'Calle Mayor 1', telefono: '600000000'
    }],
    almacen: [],
    presupuestos: [{
      id: 'P-10', clienteId: 'cliente-1', estado: 'aprobado',
      lineItems: [
        { descripcion: 'Puerta', ref: 'PT-1', precio: 120 },
        { descripcion: 'Montaje', ref: 'MO-1', precio: 65 }
      ]
    }],
    albaranes: [{
      id: 'albaran-1', numero: 3, fecha: '2026-03-04', firmadoAt: '2026-03-05T10:00:00Z',
      firmaCliente: 'firma', estado: 'firmado', presupuestoId: 'P-10', clienteId: 'cliente-1',
      clienteNombre: 'Cliente Uno', clienteDireccion: 'Obra 2', clienteDocumento: '12345678Z',
      lineas: [{
        codigo: 'MO-1', descripcion: 'Montaje', cantidad: 3, unidad: 'h',
        presupuestoLineaIndex: 1, precioPresupuesto: 50
      }]
    }, {
      id: 'albaran-legacy', numero: 4, fecha: '2026-03-04', firmadoAt: '2026-03-05T10:00:00Z',
      firmaCliente: 'firma', estado: 'firmado', presupuestoId: 'P-10', clienteId: 'cliente-1',
      clienteNombre: 'Cliente Uno',
      lineas: [{ descripcion: 'Montaje', cantidad: 3, unidad: 'h' }]
    }]
  });

  await entorno.window.exportarAlbaranesSage();
  assert.equal(descargas.length, 1);
  const csv = await descargas[0].text();
  assert.match(csv, /ALB-2026-0003/);
  assert.match(csv, /P-10/);
  assert.match(csv, /MO-1;Montaje;3;h;50,00;150,00;21;31,50;181,50/);
  assert.match(csv, /;Montaje;3;h;65,00;195,00;21;40,95;235,95/);
  assert.match(csv, /C001;12345678Z;Cliente Uno;Obra 2/);
  assert.match(avisos.at(-1).mensaje, /Exportados 2 albarán/);
  assert.equal(avisos.at(-1).tipo, 'success');
});

test('omite albaranes sin firma, presupuesto aprobado o precio identificable', async () => {
  const { entorno, descargas, avisos } = cargarExportador({
    clientes: [],
    almacen: [],
    presupuestos: [{
      id: 'P-20', estado: 'aprobado', lineItems: [{ descripcion: 'Trabajo', precio: 75 }]
    }],
    albaranes: [
      {
        id: 'pendiente', numero: 1, fecha: '2026-01-01', estado: 'pendiente',
        presupuestoId: 'P-20', lineas: [{ descripcion: 'Trabajo', cantidad: 1 }]
      },
      {
        id: 'sin-precio', numero: 2, fecha: '2026-01-02', estado: 'firmado', firmaCliente: 'firma',
        presupuestoId: 'P-20', lineas: [{ descripcion: 'Otro trabajo', cantidad: 1 }]
      },
      {
        id: 'sin-presupuesto', numero: 3, fecha: '2026-01-03', estado: 'firmado', firmaCliente: 'firma',
        lineas: [{ descripcion: 'Trabajo', cantidad: 1 }]
      }
    ]
  });

  await entorno.window.exportarAlbaranesSage();
  assert.equal(descargas.length, 0);
  assert.equal(avisos.at(-1).tipo, 'warning');
  assert.match(avisos.at(-1).mensaje, /No hay albaranes listos/);
});

test('mantiene la exportación existente de presupuestos aprobados y su referencia', async () => {
  const { entorno, descargas } = cargarExportador({
    clientes: [{ id: 'cliente-1', sageCodigo: 'C001', dni: '12345678Z', nombre: 'Cliente Uno' }],
    almacen: [],
    presupuestos: [{
      id: 'P-30', estado: 'aprobado', fecha: '2026-04-01', clienteId: 'cliente-1',
      clienteNombre: 'Cliente Uno',
      lineItems: [{ ref: 'PT-30', descripcion: 'Puerta', cantidad: 2, precio: 125 }]
    }]
  });

  await entorno.window.exportarPresupuestosSage();
  assert.equal(descargas.length, 1);
  const csv = await descargas[0].text();
  assert.match(csv, /PT-30;Puerta;2;125,00;250,00;21;52,50;302,50/);
});
