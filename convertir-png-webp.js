// Convierte los PNG de plantillas/ a WebP usando sharp (se instala temporalmente)
// Uso: node convertir-png-webp.js
const fs = require('fs');
const path = require('path');

const DIR = path.join(__dirname, 'plantillas');

async function main() {
  let sharp;
  try { sharp = require('sharp'); }
  catch (e) {
    console.log('Instalando sharp temporalmente...');
    const { execSync } = require('child_process');
    execSync('npm install --no-save sharp', { stdio: 'inherit' });
    sharp = require('sharp');
  }

  const pngs = fs.readdirSync(DIR).filter(f => f.toLowerCase().endsWith('.png'));
  if (!pngs.length) { console.log('No hay PNG en ' + DIR); return; }

  for (const f of pngs) {
    const src = path.join(DIR, f);
    const dst = path.join(DIR, f.replace(/\.png$/i, '.webp'));
    const antes = fs.statSync(src).size;
    await sharp(src).webp({ quality: 82 }).toFile(dst);
    const despues = fs.statSync(dst).size;
    console.log(`${f}  ${(antes / 1048576).toFixed(2)} MB  ->  ${path.basename(dst)}  ${(despues / 1048576).toFixed(2)} MB  (-${Math.round((1 - despues / antes) * 100)}%)`);
  }
  console.log('\nListo. Revisa que los .webp se ven bien antes de borrar los .png.');
}

main().catch(e => { console.error(e); process.exit(1); });
