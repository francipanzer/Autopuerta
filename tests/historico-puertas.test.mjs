import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

test('el histórico incluye partes y revisiones vinculadas directamente o por sus ítems', async () => {
  const body = { innerHTML: '' };
  const records = {
    puertas: [{ id: 'P1', clienteId: 'C1', nombre: 'Puerta' }],
    clientes: [{ id: 'C1', nombre: 'Centro' }],
    partesTrabajo: [{ id: 'T1', fecha: '2026-01-01', puertaIds: ['P1'], puertasDetalle: { P1: 'Motor cambiado' } }],
    revisiones: [
      { id: 'R1', fecha: '2026-02-01', puertaId: 'P1', items: [{ concepto: 'Muelles' }], hallazgos: 'Desgaste', correctivo: 'Ajuste' },
      { id: 'R2', fecha: '2026-03-01', items: [{ puertaId: 'P1', hallazgoTexto: 'Ruido' }] }
    ]
  };
  const context = {
    document: { getElementById: () => body },
    dbGet: async (store, id) => records[store].find(x => x.id === id),
    dbGetAll: async store => records[store],
    showToast() {}, openModal() {}, formatDate: x => x, console
  };
  context.window = context;
  runInNewContext(readFileSync(new URL('../js/historico-puertas.js', import.meta.url), 'utf8'), context);
  await context.verHistoricoPuerta('P1');
  for (const texto of ['T1', 'Motor cambiado', 'R1', 'Desgaste', 'Ajuste', 'R2', 'Ruido'])
    assert.ok(body.innerHTML.includes(texto), `Falta ${texto}`);
});
