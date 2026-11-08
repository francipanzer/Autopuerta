// Genera icon-192.png e icon-512.png con sharp (SVG -> PNG)
const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

const svg = (size) => `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}">
  <rect width="${size}" height="${size}" rx="${size * 0.18}" fill="#4f46e5"/>
  <circle cx="${size / 2}" cy="${size * 0.42}" r="${size * 0.22}" fill="#ffffff"/>
  <path d="M ${size / 2 - size * 0.136} ${size * 0.575} L ${size / 2} ${size * 0.88} L ${size / 2 + size * 0.136} ${size * 0.575} Z" fill="#ffffff"/>
  <circle cx="${size / 2}" cy="${size * 0.42}" r="${size * 0.092}" fill="#4f46e5"/>
</svg>`;

(async () => {
  const dir = path.join(__dirname, 'icons');
  for (const s of [192, 512]) {
    await sharp(Buffer.from(svg(s))).png().toFile(path.join(dir, `icon-${s}.png`));
    console.log('creado icon-' + s + '.png');
  }
})();
