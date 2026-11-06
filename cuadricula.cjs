// Genera tarjetas de recorte con una cuadrícula de referencia para colocar casillas
// Uso: node cuadricula.cjs plantillas/plantillaX.webp
const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

(async () => {
  const src = process.argv[2];
  if (!src) { console.error('Falta la ruta de la imagen'); process.exit(1); }
  const m = await sharp(src).metadata();
  const W = m.width, H = m.height;
  const nombre = path.basename(src, path.extname(src));

  // SVG con cuadrícula cada 5% y etiquetas cada 10%
  let lines = '';
  for (let p = 5; p < 100; p += 5) {
    const mayor = p % 10 === 0;
    const color = mayor ? 'rgba(220,38,38,.55)' : 'rgba(100,116,139,.25)';
    lines += `<line x1="${W * p / 100}" y1="0" x2="${W * p / 100}" y2="${H}" stroke="${color}" stroke-width="${mayor ? 2 : 1}"/>`;
    lines += `<line x1="0" y1="${H * p / 100}" x2="${W}" y2="${H * p / 100}" stroke="${color}" stroke-width="${mayor ? 2 : 1}"/>`;
    if (mayor) {
      lines += `<text x="${W * p / 100 + 3}" y="14" font-size="13" fill="#dc2626" font-family="Arial" font-weight="bold">${p}%</text>`;
      lines += `<text x="3" y="${H * p / 100 - 3}" font-size="13" fill="#dc2626" font-family="Arial" font-weight="bold">${p}%</text>`;
    }
  }
  const svg = `<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">${lines}</svg>`;

  const out = `_cuad_${nombre}.png`;
  await sharp(src).composite([{ input: Buffer.from(svg), top: 0, left: 0 }]).png().toFile(out);
  console.log('Generada', out, `(${W}x${H})`);
})();
