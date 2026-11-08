import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import vm from 'node:vm';

const { sincronizar } = createRequire(import.meta.url)('../js/icono-marca.js');

test('sincroniza el icono personalizado en la aplicación y la autenticación', () => {
  const imagenes = [{ src: '' }, { src: '' }];
  const documento = { querySelectorAll: selector => {
    assert.equal(selector, '.logo img, .auth-logo');
    return imagenes;
  } };
  sincronizar(documento, { getItem: key => key === 'ap_custom_icon' ? 'data:image/png;base64,abc' : null });
  assert.deepEqual(imagenes.map(img => img.src), ['data:image/png;base64,abc', 'data:image/png;base64,abc']);
  sincronizar(documento, { getItem: () => null });
  assert.deepEqual(imagenes.map(img => img.src), ['icons/icon-192.png', 'icons/icon-192.png']);
});

test('avisa y usa el icono original si no se puede leer el almacenamiento', () => {
  const warnings = [];
  const context = { window: {}, console: { warn: (...args) => warnings.push(args) } };
  vm.runInNewContext(fs.readFileSync(new URL('../js/icono-marca.js', import.meta.url), 'utf8'), context);
  const imagen = { src: '' };
  const error = new Error('almacenamiento inaccesible');
  context.window.IconoMarca.sincronizar(
    { querySelectorAll: () => [imagen] },
    { getItem: () => { throw error; } }
  );
  assert.equal(imagen.src, 'icons/icon-192.png');
  assert.equal(warnings.length, 1);
  assert.equal(warnings[0][1], error);
});

test('las pantallas de acceso, configuración inicial y recuperación muestran el icono personalizado', () => {
  let logo;
  const screen = {
    set innerHTML(html) {
      assert.match(html, /class="auth-logo"/);
      logo = { src: 'icons/icon-192.png' };
    },
    querySelectorAll: () => [],
    querySelector: () => ({ addEventListener() {} })
  };
  const sidebarLogo = { src: 'icons/icon-192.png' };
  const app = {};
  const document = {
    getElementById: () => screen,
    querySelector: () => app,
    querySelectorAll: selector => {
      assert.equal(selector, '.logo img, .auth-logo');
      return [sidebarLogo, logo];
    },
    addEventListener() {}
  };
  const window = { IconoMarca: { sincronizar }, addEventListener() {} };
  const localStorage = { getItem: () => 'data:image/png;base64,abc' };
  const context = vm.createContext({ window, document, localStorage, console, setInterval() {} });
  vm.runInContext(fs.readFileSync(new URL('../js/auth.js', import.meta.url), 'utf8'), context);
  for (const expression of ['renderAuthScreen(false)', 'renderAuthScreen(true)', 'renderPasswordRecovery()']) {
    vm.runInContext(expression, context);
    assert.equal(logo.src, 'data:image/png;base64,abc', expression);
    assert.equal(sidebarLogo.src, logo.src);
    assert.equal(screen.hidden, false);
    assert.equal(app.hidden, true);
  }
});
