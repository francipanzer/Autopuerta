// Últimos 9: VEHÍCULO(S) y emojis 🚗/✏️ en cabeceras de rutas
const fs = require('fs');
const f = 'js/pages.js';
let t = fs.readFileSync(f, 'utf8');
// VEHÍCULO / VEHÍCULOS (Í = Â + Í corrupto)
t = t.split('VEHÁÂCULO').join('VEHÍCULO');
t = t.split('VEHÁÂCULOS').join('VEHÍCULOS');
// h2 Rutas con coche 🚗: "Y>ïÂÂ¸ÂÂ Rutas"
t = t.split('Y>ïÂÂ¸ÂÂ Rutas').join('🚗 Rutas');
// botón editar ✏️: "oïÂÂ¸ÂÂ Editar"
t = t.split('oïÂÂ¸ÂÂ Editar').join('✏️ Editar');
// label RUTA: "Y>ïÂÂ¸ÂÂ RUTA"
t = t.split('Y>ïÂÂ¸ÂÂ RUTA').join('🚗 RUTA');
fs.writeFileSync(f, t, 'utf8');
console.log('restante:', (t.match(/[ÂÃ][\x80-\xBF]/g) || []).length);
