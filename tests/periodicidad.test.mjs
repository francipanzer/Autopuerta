// Tabla de periodicidades (foto del cliente) → Periodicidad en js/tipos-puerta.js
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

function cargar() {
  const win = { addEventListener() {}, removeEventListener() {} };
  const sandbox = { window: win, console, document: { addEventListener() {} }, localStorage: { getItem() { return null; }, setItem() {} } };
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(new URL('../js/tipos-puerta.js', import.meta.url), 'utf8'), sandbox);
  return sandbox.window.Periodicidad;
}
const P = cargar();
const meses = p => P.frecuenciaMeses(p);

test('garaje y residencial: por nº de vehículos', () => {
  assert.equal(meses({ tipo: 'basculante', uso: 'garaje', nVehiculos: 5 }), 12);
  assert.equal(meses({ tipo: 'basculante', uso: 'garaje', nVehiculos: 6 }), 6);
  assert.equal(meses({ tipo: 'basculante', uso: 'garaje', nVehiculos: 50 }), 6);
  assert.equal(meses({ tipo: 'basculante', uso: 'garaje', nVehiculos: 51 }), 4);
});
test('garaje: el uso estacional manda (12 meses) aunque haya muchos vehículos', () => {
  assert.equal(meses({ tipo: 'basculante', uso: 'garaje', nVehiculos: 80, usoEstacional: true }), 12);
});
test('industrial: 6 meses, 4 si es puerta rápida', () => {
  assert.equal(meses({ tipo: 'seccional', uso: 'industrial' }), 6);
  assert.equal(meses({ tipo: 'rapida', uso: 'industrial' }), 4);
  assert.equal(meses({ tipo: 'rapida_apilable', uso: 'industrial' }), 4);
});
test('comercial: ciclos/día y enrollables', () => {
  assert.equal(meses({ tipo: 'corredera', uso: 'comercial', ciclosDia: 10 }), 6);
  assert.equal(meses({ tipo: 'corredera', uso: 'comercial', ciclosDia: 11 }), 4);
  assert.equal(meses({ tipo: 'enrollable', uso: 'comercial', ciclosDia: 500 }), 12);
});
test('sin uso indicado se asume el habitual del tipo', () => {
  assert.equal(P.usoPuerta({ tipo: 'seccional' }), 'industrial');
  assert.equal(meses({ tipo: 'rapida' }), 4);
  assert.equal(meses({ tipo: 'enrollable' }), 12);
});
test('datos incompletos: periodicidad supuesta y marcada como incompleta', () => {
  const g = P.periodicidad({ tipo: 'basculante', uso: 'garaje' });
  assert.equal(g.meses, 6); assert.equal(g.completo, false);
  const c = P.periodicidad({ tipo: 'corredera', uso: 'comercial' });
  assert.equal(c.meses, 6); assert.equal(c.completo, false);
});
test('sumarMeses: fin de mes y cambio de año', () => {
  assert.equal(P.sumarMeses('2026-08-31', 6), '2027-02-28');
  assert.equal(P.sumarMeses('2027-08-31', 6), '2028-02-29');
  assert.equal(P.sumarMeses('2026-11-08', 4), '2027-03-08');
  assert.equal(P.sumarMeses('2026-01-15', 12), '2027-01-15');
  assert.equal(P.sumarMeses('basura', 3), null);
});
test('proximaRevision usa la periodicidad de la puerta', () => {
  assert.equal(P.proximaRevision({ tipo: 'rapida', uso: 'industrial' }, '2026-11-08'), '2027-03-08');
  assert.equal(P.proximaRevision({ tipo: 'seccional', uso: 'industrial' }, '2026-11-08'), '2027-05-08');
});
