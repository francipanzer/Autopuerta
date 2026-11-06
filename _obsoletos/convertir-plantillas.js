// Convierte los SVG de plantillas a PNG 2x con Chrome headless
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const files = ['seccional', 'cortafuegos', 'corredera', 'enrollable', 'basculante'];

const dir = path.join(__dirname, 'plantillas');
for (const f of files) {
  const svgPath = path.join(dir, `plantilla${f}.svg`);
  const pngPath = path.join(dir, `plantilla${f}.png`);
  const svg = fs.readFileSync(svgPath, 'utf8');
  // Aumentar resolución: el SVG ya es 1654x1169, Chrome lo rasteriza a tamaño ventana
  const html = `<!DOCTYPE html><html><head><style>html,body{margin:0;padding:0}img{width:1654px;height:1169px;display:block}</style></head><body><img src="file:///${svgPath.replace(/\\/g, '/')}"></body></html>`;
  const htmlPath = path.join(dir, `__tmp_${f}.html`);
  fs.writeFileSync(htmlPath, html);
  execSync(`"${CHROME}" --headless --disable-gpu --screenshot="${pngPath}" --window-size=1654,1169 --default-background-color=FFFFFFFF "file:///${htmlPath.replace(/\\/g, '/')}"`, { stdio: 'inherit' });
  fs.unlinkSync(htmlPath);
  console.log('OK', f);
}
