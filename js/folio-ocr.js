/* Lectura de folios de rutas (tiendas/centros + dirección) a partir de una foto.
   Pipeline: preprocess (escala de grises sin marcador + binarizado adaptativo) -> OCR (Tesseract) -> parseFolioLines.
   Sin dependencias del DOM en las funciones puras, para poder probarlas en Node. */
(function (root) {
  'use strict';

  // ---------- Preprocesado ----------
  // rgba: Uint8ClampedArray|Buffer (4 canales). Devuelve gris binarizado (0 = tinta, 255 = papel).
  function preprocessRGBA(rgba, w, h, channels) {
    channels = channels || 4;
    const n = w * h;
    const gray = new Uint8Array(n);
    // Rotulador verde: se aclara hasta el tono del papel; la tinta que queda debajo sigue oscura.
    // Resto de píxeles: canal máximo (suaviza sombras de color).
    for (let i = 0, p = 0; i < n; i++, p += channels) {
      const r = rgba[p], g = rgba[p + 1], b = rgba[p + 2];
      const rb = r > b ? r : b;
      if (g - rb > 25) { const v = rb * 1.35; gray[i] = v > 255 ? 255 : v; }
      else gray[i] = g > rb ? g : rb;
    }
    // Umbral adaptativo con imagen integral (compensa sombras y fondo irregular)
    const integral = new Float64Array((w + 1) * (h + 1));
    for (let y = 0; y < h; y++) {
      let row = 0;
      for (let x = 0; x < w; x++) {
        row += gray[y * w + x];
        integral[(y + 1) * (w + 1) + (x + 1)] = integral[y * (w + 1) + (x + 1)] + row;
      }
    }
    const half = Math.max(8, Math.round(Math.min(w, h) / 24));
    const out = new Uint8Array(n);
    for (let y = 0; y < h; y++) {
      const y0 = Math.max(0, y - half), y1 = Math.min(h, y + half + 1);
      for (let x = 0; x < w; x++) {
        const x0 = Math.max(0, x - half), x1 = Math.min(w, x + half + 1);
        const area = (x1 - x0) * (y1 - y0);
        const sum = integral[y1 * (w + 1) + x1] - integral[y0 * (w + 1) + x1] - integral[y1 * (w + 1) + x0] + integral[y0 * (w + 1) + x0];
        const mean = sum / area;
        out[y * w + x] = gray[y * w + x] < mean * 0.78 ? 0 : 255;
      }
    }
    return { gray, bin: out };
  }

  // Estima el ángulo de inclinación (grados) maximizando la varianza del perfil horizontal de tinta.
  function estimateSkew(bin, w, h) {
    const step = Math.max(1, Math.floor(w / 700));
    const sw = Math.floor(w / step), sh = Math.floor(h / step);
    const pts = [];
    for (let y = 0; y < sh; y++) for (let x = 0; x < sw; x++) if (bin[y * step * w + x * step] === 0) pts.push(x, y);
    let best = 0, bestScore = -1;
    for (let a = -15; a <= 15.001; a += 0.25) {
      const t = a * Math.PI / 180, sin = Math.sin(t), cos = Math.cos(t);
      const prof = new Float64Array(sh * 2 + 2);
      for (let i = 0; i < pts.length; i += 2) {
        const yy = Math.round(pts[i + 1] * cos - pts[i] * sin) + sh;
        if (yy >= 0 && yy < prof.length) prof[yy]++;
      }
      let s = 0;
      for (let i = 1; i < prof.length; i++) { const d = prof[i] - prof[i - 1]; s += d * d; }
      if (s > bestScore) { bestScore = s; best = a; }
    }
    return best;
  }

  // Gira una imagen de 1 canal (grados, sentido horario positivo) ampliando el lienzo para no recortar esquinas.
  function rotateImage(src, w, h, deg, smooth) {
    if (Math.abs(deg) < 0.05) return { data: src, width: w, height: h };
    const t = deg * Math.PI / 180, sin = Math.sin(t), cos = Math.cos(t);
    const nw = Math.ceil(Math.abs(w * cos) + Math.abs(h * sin));
    const nh = Math.ceil(Math.abs(w * sin) + Math.abs(h * cos));
    const out = new Uint8Array(nw * nh).fill(255);
    const cx = w / 2, cy = h / 2, ncx = nw / 2, ncy = nh / 2;
    for (let y = 0; y < nh; y++) {
      for (let x = 0; x < nw; x++) {
        const dx = x - ncx, dy = y - ncy;
        const fx = cx + dx * cos - dy * sin, fy = cy + dx * sin + dy * cos;
        if (smooth) {
          const x0 = Math.floor(fx), y0 = Math.floor(fy);
          if (x0 < 0 || y0 < 0 || x0 + 1 >= w || y0 + 1 >= h) continue;
          const ax = fx - x0, ay = fy - y0, i = y0 * w + x0;
          out[y * nw + x] = (src[i] * (1 - ax) + src[i + 1] * ax) * (1 - ay) + (src[i + w] * (1 - ax) + src[i + w + 1] * ax) * ay;
        } else {
          const sx = Math.round(fx), sy = Math.round(fy);
          if (sx >= 0 && sx < w && sy >= 0 && sy < h) out[y * nw + x] = src[sy * w + sx];
        }
      }
    }
    return { data: out, width: nw, height: nh };
  }

  // Imagen lista para Tesseract: gris enderezado y sin marcador/sombras (se conserva el gris solo cerca de la tinta).
  // Las líneas de la tabla se dejan: ayudan a Tesseract a no mezclar columnas y quitarlas empeora los espacios.
  function cleanForOCR(rgba, w, h, channels, opts) {
    const pre = preprocessRGBA(rgba, w, h, channels);
    const angle = estimateSkew(pre.bin, w, h);
    const g = rotateImage(pre.gray, w, h, angle, true);
    // Documentos impresos (albaranes): solo se endereza y se quita el color; enmascarar la tinta borraría el texto fino
    if (opts && opts.mask === false) return { gray: g.data, width: g.width, height: g.height, angle };
    const b = rotateImage(pre.bin, w, h, angle, false);
    const W = g.width, H = g.height, dil = 2;
    const out = new Uint8Array(W * H).fill(255);
    for (let y = dil; y < H - dil; y++) {
      for (let x = dil; x < W - dil; x++) {
        const i = y * W + x;
        if (b.data[i] === 0) {
          for (let dy = -dil; dy <= dil; dy++) for (let dx = -dil; dx <= dil; dx++) out[i + dy * W + dx] = g.data[i + dy * W + dx];
        }
      }
    }
    return { gray: out, width: W, height: H, angle };
  }

  // ---------- Parser ----------
  const STREET_RE = /\b(c\/|c\.\/|calle|cl\.|avda|avds|avd|av\.|avenida|plza|pza|pl\.|plaza|pso|paseo|trav|travesia|camino|cam\.|ronda|ctra|carretera|pol\.|pol\b|p\.\s?i\b|p\.\s?i\.|poligono|urb|urbanizacion|autovia|c\/)/i;
  const CP_RE = /\b0?\d{4,5}\b/;
  const norm = s => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

  function cleanText(s) {
    return String(s || '')
      .replace(/[|¦\[\]{}_—–~«»“”"]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }
  function letters(s) { return (String(s).match(/[A-Za-zÁÉÍÓÚÜÑáéíóúüñ]/g) || []).length; }

  function looksAddress(t) {
    if (!t) return false;
    const hasCp = /\b0?\d{5}\b/.test(t);
    const hasStreet = STREET_RE.test(t);
    return hasStreet || (hasCp && /\d/.test(t) && letters(t) >= 4) || (/,\s*\d+\b/.test(t) && letters(t) >= 5);
  }

  function rutaFromText(t) {
    const m = String(t).match(/\bR?UTA\s*([0-9OoIlS]{1,3})\b/);
    if (!m) return null;
    const n = m[1].replace(/[Oo]/g, '0').replace(/[Il]/g, '1').replace(/S/g, '5');
    return /^\d+$/.test(n) ? String(parseInt(n, 10)) : null;
  }

  function cleanName(s) {
    let t = cleanText(s);
    t = t.replace(/^[^A-Za-zÁÉÍÓÚÑ(]+/, '')                     // km y símbolos delante
         .replace(/\.(\s*\.)+/g, '.')
         .replace(/^([A-Za-z])\s*[.\-]\s*(?=[A-Za-z])/, '$1.')      // "H -ASPE" -> "H.ASPE"
         .replace(/^[^A-Za-zÁÉÍÓÚÑ0-9(]+|[^A-Za-zÁÉÍÓÚÑ0-9).]+$/g, '');
    // Ruido de OCR: letras minúsculas sueltas al principio o restos de 1-2 letras al final
    const tok = t.split(' ');
    while (tok.length > 1 && /^[a-záéíóúñ]$/.test(tok[0])) tok.shift();
    while (tok.length > 1 && /^([a-záéíóúñ]{1,2}|[A-Z][a-záéíóúñ])$/.test(tok[tok.length - 1])) tok.pop();
    // Palabra repetida por lecturas dobles: "H.SECTOR H.SECTOR QUINTO"
    for (let k = 1; k <= 2 && tok.length > k; k++) {
      const a = tok.slice(0, k).join('').replace(/[^A-Za-z0-9]/g, '').toLowerCase();
      const b = tok.slice(k).join('').replace(/[^A-Za-z0-9]/g, '').toLowerCase();
      if (a.length >= 4 && b.startsWith(a)) { tok.splice(0, k); break; }
    }
    return tok.join(' ').replace(/[^A-Za-zÁÉÍÓÚÑ0-9).]+$/g, '').replace(/\s{2,}/g, ' ').trim();
  }
  function cleanAddress(s) {
    return cleanText(s).replace(/^[^A-Za-zÁÉÍÓÚÑ0-9(]+|[^A-Za-zÁÉÍÓÚÑ0-9).]+$/g, '').replace(/\s+,/g, ',').trim();
  }

  // lines: [{text, x0, y0, x1, y1, conf}] (coordenadas de la imagen enderezada)
  // Devuelve { rutas: [{numero, clientes:[{nombre, direccion, conf, bbox}]}], addrX, imgW }
  function parseFolioLines(lines) {
    const items = lines.map(l => ({ ...l, t: cleanText(l.text) })).filter(l => letters(l.t) >= 2 || /\d{5}/.test(l.t));
    const heights = items.map(l => l.y1 - l.y0).sort((a, b) => a - b);
    const lineH = heights.length ? heights[Math.floor(heights.length / 2)] : 40;
    const yc = l => (l.y0 + l.y1) / 2;

    const rutaMarks = [];
    const body = [];
    for (const l of items) {
      if (/\bR?UTA\b|^R?UTA\s*\d|\bRUTA/i.test(l.t) && !looksAddress(l.t) && letters(l.t) <= 8) {
        const rn = rutaFromText(l.t);
        if (rn) rutaMarks.push({ y: yc(l), numero: rn });
        continue;
      }
      if (/\b(TIENDA|DIRECCI[OÓ]N)\b/i.test(l.t) && !looksAddress(l.t)) continue;
      if (/^(KM|KMS|M)\b[\s.]*$/i.test(l.t)) continue;
      body.push(l);
    }

    // Columnas: k-means (k=2) sobre el centro horizontal. Si solo hay una columna, se decide por el texto.
    const xc = l => (l.x0 + l.x1) / 2;
    let addr = [], names = [];
    const maxX = Math.max(1, ...body.map(l => l.x1));
    let c1 = Math.min(...body.map(xc)), c2 = Math.max(...body.map(xc));
    for (let it = 0; it < 20 && body.length > 1; it++) {
      const g1 = body.filter(l => Math.abs(xc(l) - c1) <= Math.abs(xc(l) - c2));
      const g2 = body.filter(l => Math.abs(xc(l) - c1) > Math.abs(xc(l) - c2));
      if (!g1.length || !g2.length) break;
      c1 = g1.reduce((s, l) => s + xc(l), 0) / g1.length;
      c2 = g2.reduce((s, l) => s + xc(l), 0) / g2.length;
    }
    if (body.length > 1 && (c2 - c1) > maxX * 0.2) {
      const mid = (c1 + c2) / 2;
      for (const l of body) (xc(l) >= mid ? addr : names).push(l);
      // En la columna de direcciones solo se aceptan líneas con pinta de dirección (descarta cabeceras y ruido)
      addr = addr.filter(l => STREET_RE.test(l.t) || /,\s*\d/.test(l.t) || /\bs\/n\b/i.test(l.t));
    } else {
      for (const l of body) (looksAddress(l.t) ? addr : names).push(l);
    }
    // Restos de ruido (1-3 letras con poca confianza) fuera: confunden el emparejado con la dirección
    names = names.filter(l => letters(l.t) >= 4 || (letters(l.t) >= 2 && (l.conf ?? 0) >= 70));
    addr.sort((a, b) => yc(a) - yc(b));
    names.sort((a, b) => yc(a) - yc(b));

    // Nombres partidos en varias líneas: paréntesis sin cerrar o cierre suelto (máximo 2 líneas, centradas en la misma columna)
    const mergedNames = [];
    for (const n of names) {
      const prev = mergedNames[mergedNames.length - 1];
      const open = prev ? (prev.t.match(/\(/g) || []).length - (prev.t.match(/\)/g) || []).length : 0;
      const looseClose = /\)/.test(n.t) && !/\(/.test(n.t);
      if (prev && prev.parts < 2 && (open > 0 || looseClose) && yc(n) - prev.y1 < lineH * 1.2 && Math.abs(xc(n) - xc(prev)) < lineH * 6) {
        prev.t += ' ' + n.t; prev.y1 = Math.max(prev.y1, n.y1); prev.x1 = Math.max(prev.x1, n.x1); prev.x0 = Math.min(prev.x0, n.x0);
        prev.conf = Math.min(prev.conf, n.conf); prev.parts++;
      } else mergedNames.push({ ...n, parts: 1 });
    }

    // Direcciones partidas: guion/coma final, o línea que no empieza como dirección y sin nombre al lado
    const mergedAddr = [];
    for (const a of addr) {
      const prev = mergedAddr[mergedAddr.length - 1];
      const nameBeside = mergedNames.some(n => Math.abs(yc(n) - yc(a)) < lineH * 0.7);
      const cont = prev && yc(a) - prev.y1 < lineH * 1.1 && Math.abs(a.x0 - prev.x0) < 700 &&
        (/-$/.test(prev.t) || (!nameBeside && !STREET_RE.test(a.t) && !/\d{5}/.test(a.t)));
      if (cont) {
        prev.t += (/-$/.test(prev.t) ? '' : ' ') + a.t; prev.y1 = Math.max(prev.y1, a.y1); prev.x1 = Math.max(prev.x1, a.x1);
        prev.conf = Math.min(prev.conf, a.conf);
      } else mergedAddr.push({ ...a });
    }

    const pitchSamples = [];
    for (let i = 1; i < mergedAddr.length; i++) pitchSamples.push(yc(mergedAddr[i]) - yc(mergedAddr[i - 1]));
    pitchSamples.sort((a, b) => a - b);
    const pitch = pitchSamples.length ? pitchSamples[Math.floor(pitchSamples.length / 2)] : lineH * 1.8;
    // Emparejado monótono nombre <-> dirección por cercanía vertical (alineación por programación dinámica).
    // Dos pasadas: la 1ª tolerante y la 2ª corrigiendo el desfase vertical típico entre columnas (fotos torcidas).
    const NN = mergedNames.length, MM = mergedAddr.length;
    function align(dy, maxDist) {
      const dp = Array.from({ length: NN + 1 }, () => new Float64Array(MM + 1));
      const bk = Array.from({ length: NN + 1 }, () => new Int8Array(MM + 1));
      for (let i = 1; i <= NN; i++) { dp[i][0] = i; bk[i][0] = 1; }
      for (let j = 1; j <= MM; j++) { dp[0][j] = j; bk[0][j] = 2; }
      for (let i = 1; i <= NN; i++) {
        for (let j = 1; j <= MM; j++) {
          const d = Math.abs(yc(mergedNames[i - 1]) - yc(mergedAddr[j - 1]) - dy);
          let best = dp[i - 1][j] + 1, b = 1;
          if (dp[i][j - 1] + 1 < best) { best = dp[i][j - 1] + 1; b = 2; }
          if (d <= maxDist) { const m = dp[i - 1][j - 1] + d / maxDist - 0.01; if (m < best) { best = m; b = 3; } }
          dp[i][j] = best; bk[i][j] = b;
        }
      }
      const map = new Map();
      for (let i = NN, j = MM; i > 0 || j > 0;) {
        const b = bk[i][j];
        if (b === 3) { map.set(j - 1, i - 1); i--; j--; }
        else if (b === 1) i--; else j--;
      }
      return map;
    }
    let nameOf = align(0, Math.max(lineH, pitch * 0.95));
    if (nameOf.size >= 2) {
      const ds = [...nameOf].map(([ai, ni]) => yc(mergedNames[ni]) - yc(mergedAddr[ai])).sort((p, q) => p - q);
      nameOf = align(ds[Math.floor(ds.length / 2)], Math.max(lineH, pitch * 0.75));
    }
    const usedN = new Set(nameOf.values());

    const rows = [];
    mergedAddr.forEach((a, ai) => {
      const ni = nameOf.get(ai);
      const n = ni != null ? mergedNames[ni] : null;
      rows.push({
        y: yc(a), nombre: n ? cleanName(n.t) : '', direccion: cleanAddress(a.t),
        conf: Math.min(a.conf ?? 100, n ? (n.conf ?? 100) : 0),
        bbox: { x0: a.x0, y0: Math.min(a.y0, n ? n.y0 : a.y0), x1: a.x1, y1: Math.max(a.y1, n ? n.y1 : a.y1) },
        addrBox: { x0: a.x0, y0: a.y0, x1: a.x1, y1: a.y1 }
      });
    });
    // Nombres sin dirección: filas con dirección vacía, salvo cabeceras de zona (todo mayúsculas, sin punto)
    mergedNames.forEach((n, ni) => {
      if (usedN.has(ni)) return;
      const nm = cleanName(n.t);
      if (letters(nm) < 3 || (n.conf ?? 0) < 60) return;
      if (/^[A-ZÁÉÍÓÚÑ ]{4,}$/.test(nm) && !/^[A-Z]\./.test(nm)) return;
      rows.push({ y: yc(n), nombre: nm, direccion: '', conf: n.conf ?? 0, bbox: { x0: n.x0, y0: n.y0, x1: n.x1, y1: n.y1 } });
    });
    rows.sort((a, b) => a.y - b.y);

    // Ruta = última marca "RUTA n" por encima de la fila (o la primera si todas están debajo)
    rutaMarks.sort((a, b) => a.y - b.y);
    const groups = new Map();
    for (const r of rows) {
      let mark = null;
      for (const m of rutaMarks) if (m.y <= r.y) mark = m;
      const numero = mark ? mark.numero : (rutaMarks.length ? rutaMarks[0].numero : '');
      if (!groups.has(numero)) groups.set(numero, []);
      groups.get(numero).push(r);
    }
    const rutas = [...groups.entries()].map(([numero, clientes]) => ({ numero, clientes }));
    const addrXs = mergedAddr.map(a => a.x0).sort((a, b) => a - b);
    // Geometría de la columna de nombres según las filas bien emparejadas (para la segunda pasada)
    const dys = [], nx0 = [], nx1 = [];
    mergedAddr.forEach((a, ai) => {
      const ni = nameOf.get(ai);
      if (ni == null) return;
      const n = mergedNames[ni];
      dys.push(yc(n) - yc(a)); nx0.push(n.x0); nx1.push(n.x1);
    });
    const med = arr => arr.length ? arr.slice().sort((p, q) => p - q)[Math.floor(arr.length / 2)] : 0;
    const nameCols = nx0.length ? { x0: Math.min(...nx0) - 40, x1: Math.max(...nx1) + 40, dy: med(dys) } : null;
    return { rutas, addrX: addrXs.length ? addrXs[0] : null, nameCols };
  }

  // ---------- Orquestador ----------
  // worker: Tesseract worker ya inicializado ('spa'). host.encode(gray, w, h) -> imagen aceptada por worker.recognize.
  async function recognizeFolio(worker, rgba, w, h, channels, host) {
    const progress = (host && host.onProgress) || (() => {});
    progress('Enderezando y limpiando la imagen…', 0.05);
    const img = cleanForOCR(rgba, w, h, channels);
    progress('Leyendo texto…', 0.15);
    await worker.setParameters({ tessedit_pageseg_mode: '11' });
    const res = await worker.recognize(await host.encode(img.gray, img.width, img.height), {}, { blocks: true });
    const lines = (res.data.lines || []).map(l => ({
      text: l.text, x0: l.bbox.x0, y0: l.bbox.y0, x1: l.bbox.x1, y1: l.bbox.y1, conf: l.confidence
    }));
    const parsed = parseFolioLines(lines);

    // Filas que el OCR global se dejó (hueco vertical mayor que el paso entre filas): se releen recortando su banda
    const flat = parsed.rutas.flatMap(r => r.clientes.map(c => ({ r, c }))).filter(x => x.c.addrBox).sort((a, b) => a.c.y - b.c.y);
    if (flat.length >= 3 && parsed.addrX) {
      const ys = flat.map(x => x.c.y), diffs = [];
      for (let i = 1; i < ys.length; i++) diffs.push(ys[i] - ys[i - 1]);
      const pitch = diffs.slice().sort((a, b) => a - b)[Math.floor(diffs.length / 2)];
      const hs = flat.map(x => x.c.addrBox.y1 - x.c.addrBox.y0).sort((a, b) => a - b);
      const hgt = hs[Math.floor(hs.length / 2)];
      const slots = [];
      slots.push({ y: ys[0] - pitch, after: null, before: flat[0] });
      for (let i = 1; i < flat.length; i++) {
        const k = Math.round((ys[i] - ys[i - 1]) / pitch) - 1;
        for (let j = 1; j <= k; j++) slots.push({ y: ys[i - 1] + j * (ys[i] - ys[i - 1]) / (k + 1), after: flat[i - 1], before: flat[i] });
      }
      slots.push({ y: ys[ys.length - 1] + pitch, after: flat[flat.length - 1], before: null });
      const x0 = Math.max(0, Math.round(parsed.addrX - 40));
      for (const s of slots) {
        if (s.y - hgt < 0 || s.y + hgt > img.height) continue;
        progress('Buscando filas sueltas…', 0.45);
        const y0 = Math.max(0, Math.round(s.y - pitch * 0.55)), y1 = Math.min(img.height, Math.round(s.y + pitch * 0.55));
        const cw = img.width - x0, ch = y1 - y0;
        if (cw < 50 || ch < 10) continue;
        const crop = new Uint8Array(cw * ch);
        for (let y = 0; y < ch; y++) crop.set(img.gray.subarray((y0 + y) * img.width + x0, (y0 + y) * img.width + x0 + cw), y * cw);
        await worker.setParameters({ tessedit_pageseg_mode: '7' });
        const rr = await worker.recognize(await host.encode(crop, cw, ch), {}, { blocks: true });
        const txt = cleanAddress(rr.data.text || '');
        const conf = rr.data.confidence || 0;
        if (!(STREET_RE.test(txt) || /,\s*\d/.test(txt) || /\bs\/n\b/i.test(txt)) || txt.length < 12 || conf < 45) continue;
        const host_ = (s.after || s.before).r;
        const dyN = parsed.nameCols ? parsed.nameCols.dy : 0;
        const loose = parsed.rutas.flatMap(r => r.clientes).filter(c => !c.addrBox && !c.direccion && Math.abs(c.y - (s.y + dyN)) < pitch * 0.95)
          .sort((a, b) => Math.abs(a.y - s.y - dyN) - Math.abs(b.y - s.y - dyN))[0];
        if (loose) {
          loose.direccion = txt; loose.conf = Math.min(loose.conf, conf);
          loose.addrBox = { x0, y0: s.y - hgt / 2, x1: img.width, y1: s.y + hgt / 2 };
          continue;
        }
        const row = { y: s.y, nombre: '', direccion: txt, conf, bbox: null, addrBox: { x0, y0: s.y - hgt / 2, x1: img.width, y1: s.y + hgt / 2 } };
        const arr = host_.clientes;
        const ref = (s.after || s.before).c;
        arr.splice(s.after ? arr.indexOf(ref) + 1 : arr.indexOf(ref), 0, row);
      }
    }
    // Nombres sin dirección: se lee la dirección en su misma banda (admite direcciones en varias líneas)
    const sinDir = parsed.rutas.flatMap(r => r.clientes).filter(c => !c.addrBox && !c.direccion && c.nombre);
    if (sinDir.length && parsed.addrX) {
      const dyN = parsed.nameCols ? parsed.nameCols.dy : 0;
      const allY = parsed.rutas.flatMap(r => r.clientes).map(c => c.y).sort((a, b) => a - b), dd = [];
      for (let i = 1; i < allY.length; i++) dd.push(allY[i] - allY[i - 1]);
      dd.sort((a, b) => a - b);
      const pitchN = dd.length ? Math.max(40, dd[Math.floor(dd.length / 2)]) : 80;
      const x0 = Math.max(0, Math.round(parsed.addrX - 40));
      let k = 0;
      for (const c of sinDir) {
        progress('Buscando direcciones que faltan…', 0.5 + 0.1 * (k++ / sinDir.length));
        const mid = c.y - dyN;
        const y0 = Math.max(0, Math.round(mid - pitchN * 0.85)), y1 = Math.min(img.height, Math.round(mid + pitchN * 0.85));
        const cw = img.width - x0, ch = y1 - y0;
        if (cw < 50 || ch < 10) continue;
        const crop = new Uint8Array(cw * ch);
        for (let y = 0; y < ch; y++) crop.set(img.gray.subarray((y0 + y) * img.width + x0, (y0 + y) * img.width + x0 + cw), y * cw);
        await worker.setParameters({ tessedit_pageseg_mode: '6' });
        const rr = await worker.recognize(await host.encode(crop, cw, ch), {}, { blocks: true });
        const ls = (rr.data.lines || []).filter(l => Math.abs((l.bbox.y0 + l.bbox.y1) / 2 - ch / 2) < pitchN * 0.7);
        const txt = cleanAddress(ls.map(l => cleanAddress(l.text)).filter(Boolean).join(' '));
        if (!(STREET_RE.test(txt) || /,\s*\d/.test(txt) || /\bs\/n\b/i.test(txt)) || txt.length < 10) continue;
        c.direccion = txt;
        c.addrBox = { x0, y0: mid - pitchN / 4, x1: img.width, y1: mid + pitchN / 4 };
        c.conf = Math.min(c.conf, rr.data.confidence || 0);
      }
    }

    // Segunda pasada: nombres que faltan o dudosos, recortando la zona a la izquierda de la dirección de cada fila
    const rows = parsed.rutas.flatMap(r => r.clientes).filter(c => c.addrBox && (!c.nombre || letters(c.nombre) < 4));
    if (rows.length && parsed.addrX && parsed.nameCols) {
      let done = 0;
      const readName = async (c, psm, pad) => {
        await worker.setParameters({ tessedit_pageseg_mode: psm });
        const hgt = c.addrBox.y1 - c.addrBox.y0;
        const mid = (c.addrBox.y0 + c.addrBox.y1) / 2 + parsed.nameCols.dy;
        const y0 = Math.max(0, Math.round(mid - hgt * pad)), y1 = Math.min(img.height, Math.round(mid + hgt * pad));
        const x0 = Math.max(0, Math.round(parsed.nameCols.x0));
        const x1 = Math.min(img.width, Math.round(Math.min(parsed.nameCols.x1, parsed.addrX - 25)));
        const cw = x1 - x0, ch = y1 - y0;
        if (cw < 20 || ch < 10) return null;
        const crop = new Uint8Array(cw * ch);
        for (let y = 0; y < ch; y++) crop.set(img.gray.subarray((y0 + y) * img.width + x0, (y0 + y) * img.width + x0 + cw), y * cw);
        const r = await worker.recognize(await host.encode(crop, cw, ch), {}, { blocks: true });
        // Con varias líneas (psm 6) se toma la más centrada en la banda
        const ls = (r.data.lines || []).filter(l => l.words && l.words.length);
        if (!ls.length) return null;
        const target = ch / 2;
        const line = ls.reduce((b, l) => Math.abs((l.bbox.y0 + l.bbox.y1) / 2 - target) < Math.abs((b.bbox.y0 + b.bbox.y1) / 2 - target) ? l : b);
        const kept = line.words.slice();
        const isNum = wd => /^[\d.,|]+$/.test(wd.text.trim());
        while (kept.length && isNum(kept[0])) kept.shift();
        while (kept.length > 1 && isNum(kept[kept.length - 1])) {
          const last = kept[kept.length - 1], prev = kept[kept.length - 2];
          if (last.bbox.x0 - prev.bbox.x1 > (last.bbox.y1 - last.bbox.y0) * 1.5) kept.pop(); else break;
        }
        const nombre = cleanName(kept.map(x => x.text).join(' '));
        const conf = kept.length ? kept.reduce((s, x) => s + x.confidence, 0) / kept.length : 0;
        return nombre && letters(nombre) >= 3 ? { nombre, conf } : null;
      };
      for (const c of rows) {
        progress('Afinando nombres…', 0.6 + 0.35 * (done++ / rows.length));
        const got = (await readName(c, '7', 0.75)) || (await readName(c, '6', 1.1));
        if (got) { c.nombre = got.nombre; c.conf = got.conf; }
      }
    }
    progress('Listo', 1);
    return parsed;
  }

  root.FolioOCR = root.FolioOCR || {};
  root.FolioOCR.recognizeFolio = recognizeFolio;
  root.FolioOCR.parseFolioLines = parseFolioLines;
  root.FolioOCR.rutaFromText = rutaFromText;
  root.FolioOCR.cleanName = cleanName;
  root.FolioOCR.preprocessRGBA = preprocessRGBA;
  root.FolioOCR.estimateSkew = estimateSkew;
  root.FolioOCR.rotateImage = rotateImage;
  root.FolioOCR.cleanForOCR = cleanForOCR;
  if (typeof module !== 'undefined' && module.exports) module.exports = root.FolioOCR;
})(typeof window !== 'undefined' ? window : globalThis);

