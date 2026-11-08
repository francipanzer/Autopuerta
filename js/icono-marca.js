(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.IconoMarca = api;
})(typeof window !== 'undefined' ? window : null, function () {
  'use strict';

  function sincronizar(documento, almacenamiento) {
    let icono;
    try {
      icono = almacenamiento.getItem('ap_custom_icon');
    } catch (error) {
      console.warn('No se pudo leer el icono personalizado:', error);
    }
    const src = icono || 'icons/icon-192.png';
    documento.querySelectorAll('.logo img, .auth-logo').forEach(img => { img.src = src; });
  }

  return { sincronizar };
});
