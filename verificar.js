// Verificación final del proyecto completo
const { execSync } = require('child_process');
const fs = require('fs');

const files = ['js/pages.js','js/app.js','js/auth.js','js/utils.js','js/db.js',
  'js/informe-revisiones-cliente.js','js/plantillas-medidas.js','js/revision-forms.js',
  'js/pdf-generator.js','js/realtime.js','js/incidencias.js','js/push.js','sw.js','index.html'];

let ok = true;
for (const f of files) {
  const t = fs.readFileSync(f, 'utf8');
  const mojibake = (t.match(/[\u00C2\u00C3\u00EF][\x80-\xBF]/g) || []).length;
  const reemplazo = (t.match(/\uFFFD/g) || []).length;
  const bad = mojibake + reemplazo;
  let sintaxis = '';
  if (f.endsWith('.js')) {
    try { execSync(`node --check ${f}`, { stdio: 'pipe' }); sintaxis = 'OK'; }
    catch (e) { sintaxis = 'ERROR: ' + (e.stderr || e.message).toString().slice(0, 120); ok = false; }
  } else sintaxis = '(html)';
  console.log(`${f.padEnd(40)} sintaxis:${sintaxis.padEnd(6)} mojibake:${bad}`);
  if (bad > 0 && f !== 'index.html') ok = false;
}
console.log(ok ? '\nTODO CORRECTO' : '\nHAY PROBLEMAS');
