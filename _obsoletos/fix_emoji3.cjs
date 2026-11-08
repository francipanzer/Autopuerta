// Construye los reemplazos con los codepoints exactos detectados:
// 's' + [ï U+00ef, Â U+00c2, Â U+00c2, ¸ U+00b8, Â U+00c2, U+00c2, U+008f] -> 📍
const fs = require('fs');
const f = 'js/pages.js';
let t = fs.readFileSync(f, 'utf8');
const s = String.fromCodePoint(0x73, 0xef, 0xc2, 0xc2, 0xb8, 0xc2, 0xc2, 0x8f); // "s+corrupto"
const o = String.fromCodePoint(0x6f, 0x3f, 0xef, 0xc2, 0xc2, 0xb8, 0xc2, 0xc2, 0x8f); // "o?+corrupto"
let n = 0;
while (t.includes(s)) { t = t.replace(s, '📍'); n++; }
while (t.includes(o)) { t = t.replace(o, '✉️'); n++; }
// title con lupa corrupta: busca "title=" seguido de Á + bytes corruptos + 'brelas'
const lu = String.fromCodePoint(0xc1, 0xc2, 0xc2, 0x81);
while (t.includes('title="' + lu + 'brelas')) { t = t.replace('title="' + lu + 'brelas', 'title="🔍 Ábrelas'); n++; }
fs.writeFileSync(f, t, 'utf8');
console.log('sustituciones:', n, '| restante Â:', (t.match(/Â[\x80-\xBF]/g) || []).length);
