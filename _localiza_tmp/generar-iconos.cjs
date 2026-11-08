// Genera icon-192.png e icon-512.png (pin de mapa azul sobre fondo indigo)
const { createCanvas } = require('canvas');
const fs = require('fs');
const path = require('path');

function dibujar(size, file) {
  const c = createCanvas(size, size);
  const ctx = c.getContext('2d');
  // fondo
  ctx.fillStyle = '#4f46e5';
  ctx.fillRect(0, 0, size, size);
  // círculo blanco del pin
  const cx = size / 2, cy = size * 0.42, r = size * 0.22;
  ctx.fillStyle = '#ffffff';
  ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fill();
  // punta del pin
  ctx.beginPath();
  ctx.moveTo(cx - r * 0.62, cy + r * 0.75);
  ctx.lineTo(cx, size * 0.88);
  ctx.lineTo(cx + r * 0.62, cy + r * 0.75);
  ctx.closePath(); ctx.fill();
  // agujero azul
  ctx.fillStyle = '#4f46e5';
  ctx.beginPath(); ctx.arc(cx, cy, r * 0.42, 0, Math.PI * 2); ctx.fill();
  fs.writeFileSync(file, c.toBuffer('image/png'));
  console.log('creado', file);
}

const dir = path.join(__dirname, 'icons');
dibujar(192, path.join(dir, 'icon-192.png'));
dibujar(512, path.join(dir, 'icon-512.png'));
