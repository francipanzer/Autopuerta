// Recortes ampliados con cuadrícula fina (cada 2%) para medir coordenadas exactas
// Uso: node zoomzona.cjs <imagen> <x%> <y%> <w%> <h%> <nombre>
const sharp = require('sharp');

(async () => {
  const [src, xs, ys, ws, hs, nombre] = process.argv.slice(2);
  const m = await sharp(src).metadata();
  const W = m.width, H = m.height;
  const x0 = W * +xs / 100, y0 = H * +ys / 100;
  const cw = Math.round(W * +ws / 100), ch = Math.round(H * +hs / 100);

  // cuadrícula fina cada 2% global, etiquetas cada 10%
  let g = '';
  for (let p = 0; p <= 100; p += 2) {
    const px = W * p / 100, py = H * p / 100;
    if (px >= x0 && px <= x0 + cw) g += `<line x1="${px}" y1="${y0}" x2="${px}" y2="${y0 + ch}" stroke="${p % 10 ? 'rgba(220,38,38,.3)' : 'rgba(220,38,38,.85)'}" stroke-width="${p % 10 ? 1 : 2}"/>` +
      (p % 10 === 0 ? `<text x="${px + 2}" y="${y0 + 14}" font-size="12" fill="#dc2626" font-family="Arial" font-weight="bold">${p}%</text>` : '');
    if (py >= y0 && py <= y0 + ch) g += `<line x1="${x0}" y1="${py}" x2="${x0 + cw}" y2="${py}" stroke="${p % 10 ? 'rgba(37,99,235,.3)' : 'rgba(37,99,235,.85)'}" stroke-width="${p % 10 ? 1 : 2}"/>` +
      (p % 10 === 0 ? `<text x="${x0 + 2}" y="${py - 3}" font-size="12" fill="#2563eb" font-family="Arial" font-weight="bold">${p}%</text>` : '');
  }
  const out = `_zona_${nombre}.png`;
  await sharp(src).extract({ left: Math.round(x0), top: Math.round(y0), width: cw, height: ch })
    .resize(1400, null, { kernel: 'lanczos3' })
    .composite([{ input: Buffer.from(`<svg width="${cw}" height="${ch}" xmlns="http://www.w3.org/2000/svg">${g}</svg>`), top: 0, left: 0 }])
    .png().toFile(out);
  console.log('OK', out);
})();
