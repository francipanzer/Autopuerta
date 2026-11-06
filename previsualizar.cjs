// Dibuja las casillas de cada plantilla nueva sobre su imagen para verificar visualmente
const sharp = require('sharp');
global.window = {};
require('./js/medidas-datos.js');
const BASE = global.window.MEDIDAS_PLANTILLAS_BASE;

(async () => {
  for (const key of ['corredera_cristal', 'rapida_apilable']) {
    const p = BASE[key];
    const [W, H] = p.ratio;
    let svg = `<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">`;
    p.campos.forEach(f => {
      const cajas = [];
      if (f.x !== undefined) cajas.push({ x: f.x, y: f.y, w: f.w, h: f.h, pr: true });
      (f.espejos || []).forEach(e => cajas.push({ ...e, pr: false }));
      cajas.forEach(b => {
        svg += `<rect x="${b.x / 100 * W}" y="${b.y / 100 * H}" width="${b.w / 100 * W}" height="${b.h / 100 * H}" fill="rgba(37,99,235,.25)" stroke="${b.pr ? '#2563eb' : '#dc2626'}" stroke-width="2"/>`;
        const fs2 = Math.max(11, b.h / 100 * H * 0.55);
        svg += `<text x="${b.x / 100 * W + 3}" y="${b.y / 100 * H + fs2}" font-size="${fs2}" font-family="Arial" font-weight="bold" fill="#0b2a6f">${f.corto || f.id}</text>`;
      });
      (f.opciones || []).forEach(o => {
        svg += `<circle cx="${o.x / 100 * W}" cy="${o.y / 100 * H}" r="12" fill="none" stroke="#dc2626" stroke-width="3"/>`;
        svg += `<text x="${o.x / 100 * W + 16}" y="${o.y / 100 * H + 5}" font-size="13" font-family="Arial" font-weight="bold" fill="#dc2626">${o.valor}</text>`;
      });
    });
    svg += '</svg>';
    const out = `_prev_${key}.png`;
    await sharp(p.imagen).composite([{ input: Buffer.from(svg), top: 0, left: 0 }]).png().toFile(out);
    console.log('Generada', out);
  }
})();
