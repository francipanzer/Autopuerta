// Barrido global de mojibake en todos los ficheros del frontend.
// Detecta y corrige: Ã©->é, Ã³->ó, Â·->·, ï¿½ residuos, etc.
const fs = require('fs');

const MAP = {
  'Ã©': 'é', 'Ã¡': 'á', 'Ã­': 'í', 'Ã³': 'ó', 'Ãº': 'ú', 'Ã±': 'ñ', 'Ã¼': 'ü', 'Ã§': 'ç', 'Ã': 'Á',
  'Ã‰': 'É', 'Ã': 'Í', 'Ã“': 'Ó', 'Ãš': 'Ú', 'Ã‘': 'Ñ', 'Ãœ': 'Ü', 'Ã': 'À', 'Ã ': 'à',
  'Â·': '·', 'Âº': 'º', 'Âª': 'ª', 'Â«': '«', 'Â»': '»', 'Â¿': '¿', 'Â¡': '¡',
  'Ã—': '×', 'Ã·': '·', 'Ã‹': 'Ë', 'Ã¯': 'ï', 'Ã«': 'ë',
  'Ã¢â‚¬â€': '—', 'Ã¢â‚¬â€œ': '–', 'â€™': "'", 'â€˜': "'", 'â€œ': '"', 'â€\u009d': '"', 'â€¦': '…',
  'ï¿½': '·'
};

const files = ['js/pages.js', 'js/app.js', 'js/auth.js', 'js/utils.js', 'js/db.js',
  'js/informe-revisiones-cliente.js', 'js/plantillas-medidas.js', 'js/revision-forms.js',
  'js/pdf-generator.js', 'sw.js', 'index.html'];

for (const f of files) {
  let t = fs.readFileSync(f, 'utf8');
  const antes = (t.match(/Ã[\x80-\xBF]/g) || []).length + (t.match(/Â[\x80-\xBF]/g) || []).length + (t.match(/ï¿/g) || []).length;
  for (let pass = 0; pass < 4; pass++) {
    for (const [k, v] of Object.entries(MAP)) t = t.split(k).join(v);
  }
  fs.writeFileSync(f, t, 'utf8');
  const despues = (t.match(/Ã[\x80-\xBF]/g) || []).length + (t.match(/Â[\x80-\xBF]/g) || []).length + (t.match(/ï¿/g) || []).length;
  console.log(f.padEnd(40), 'antes:', String(antes).padStart(4), '→ después:', despues);
}
console.log('barrido terminado');
