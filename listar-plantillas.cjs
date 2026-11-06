const fs = require('fs');
const d = fs.readFileSync('js/medidas-datos.js', 'utf8');
const j = d.indexOf('=') + 1;
const obj = JSON.parse(d.slice(j, d.lastIndexOf(';')));
console.log(Object.keys(obj));
for (const k of Object.keys(obj)) console.log(k, '->', obj[k].imagen, obj[k].campos.length + ' campos');
