// Busca "plegable" en cualquier fuente de datos de la app (localStorage/export)
// y muestra el catálogo BASE de tipos-puerta.
const fs = require('fs');
global.window = {
  addEventListener: () => { },
  dbGetAll: async () => [],
  dbPut: async () => { },
  isAdmin: () => false,
  escapeHtml: s => s
};
new Function(fs.readFileSync('js/tipos-puerta.js', 'utf8'))();
console.log('Tipos BASE:', window.TiposPuerta.BASE.map(t => t.key + ' | ' + t.nombre).join('\n'));
