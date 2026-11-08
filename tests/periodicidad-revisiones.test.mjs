import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const { meses, proximaRevision } = createRequire(import.meta.url)('../js/periodicidad-revisiones.js');

test('garaje y residencial: límites de vehículos y uso estacional', () => {
  for (const [vehiculos, esperado] of [[0, 12], [5, 12], [6, 6], [50, 6], [51, 4]]) {
    assert.equal(meses({ uso: 'garaje_residencial', estacional: false, vehiculos }), esperado);
  }
  assert.equal(meses({ uso: 'garaje_residencial', estacional: true }), 12);
});

test('industrial: puertas rápidas y otras', () => {
  assert.equal(meses({ uso: 'industrial', rapida: true }), 4);
  assert.equal(meses({ uso: 'industrial', rapida: false }), 6);
});

test('comercial: límite de ciclos y excepción de enrollables', () => {
  for (const [ciclosDia, esperado] of [[0, 6], [10, 6], [11, 4]]) {
    assert.equal(meses({ uso: 'comercial', enrollable: false, ciclosDia }), esperado);
  }
  assert.equal(meses({ uso: 'comercial', enrollable: true }), 12);
});

test('no asigna frecuencias cuando faltan criterios o son inválidos', () => {
  for (const datos of [
    {}, { uso: 'garaje_residencial', estacional: false },
    { uso: 'garaje_residencial', estacional: false, vehiculos: -1 },
    { uso: 'industrial' }, { uso: 'comercial', enrollable: false, ciclosDia: 1.5 },
    { uso: 'comercial', enrollable: false, ciclosDia: '10' }
  ]) assert.throws(() => meses(datos), TypeError);
});

test('próxima revisión suma meses de calendario y ajusta finales de mes', () => {
  assert.equal(proximaRevision('2024-10-31', { uso: 'industrial', rapida: true }), '2025-02-28');
  assert.equal(proximaRevision('2023-10-31', { uso: 'industrial', rapida: true }), '2024-02-29');
  assert.equal(proximaRevision('2024-02-29', { uso: 'comercial', enrollable: true }), '2025-02-28');
  assert.throws(() => proximaRevision('2025-02-29', { uso: 'industrial', rapida: true }), TypeError);
});
