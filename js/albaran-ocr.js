/* Lectura de albaranes/facturas de proveedor (foto o PDF) para dar entrada de material en Almacén.
   - parseAlbaranLines: líneas de texto con posición -> cabecera (proveedor, nº, fecha, total) + líneas de material.
   - matchArticulos: empareja cada línea con un artículo del almacén (memoria del proveedor, referencia, nombre parecido).
   - readAlbaranImage / readAlbaranPdf: orquestan OCR (Tesseract, vía js/folio-ocr.js) o texto nativo del PDF (pdf.js).
   Las funciones puras no tocan el DOM y se prueban en Node (tests/albaran-ocr.test.mjs). */
(function (root) {
  'use strict';

  const norm = s => String(s == null ? '' : s).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  const nk = s => norm(s).replace(/[^a-z0-9]/g, '');
  const letters = s => (String(s).match(/[A-Za-zÁÉÍÓÚÜÑáéíóúüñ]/g) || []).length;
  const round2 = n => Math.round(n * 100) / 100;

  // ---------- Números y fechas ----------
  // "1.234,56" -> 1234.56 · "1,234.56" -> 1234.56 · "12,5" -> 12.5 · "12.50" -> 12.5 · "1.234" (3 decimales dudosos) -> 1234
  function parseNum(tok) {
    let s = String(tok).replace(/[€\s]|eur(os)?$/gi, '').replace(/%$/, '');
    if (!/\d/.test(s) || !/^-?[\d.,]+$/.test(s)) return null;
    const lastComma = s.lastIndexOf(','), lastDot = s.lastIndexOf('.');
    if (lastComma >= 0 && lastDot >= 0) {
      const dec = lastComma > lastDot ? ',' : '.';
      s = dec === ',' ? s.replace(/\./g, '').replace(',', '.') : s.replace(/,/g, '');
    } else if (lastComma >= 0) {
      s = (s.match(/,/g) || []).length > 1 ? s.replace(/,/g, '') : s.replace(',', '.');
    } else if (lastDot >= 0 && ((s.match(/\./g) || []).length > 1 || /^-?\d{1,3}\.\d{3}$/.test(s))) {
      s = s.replace(/\./g, '');
    }
    const n = parseFloat(s);
    return Number.isFinite(n) ? n : null;
  }
  const isNumTok = t => /^-?\d[\d.,]*%?$/.test(t.replace(/[€]$/, '')) && parseNum(t) != null;

  function parseDate(text) {
    const m = String(text).match(/\b(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})\b/);
    if (!m) return null;
    let d = +m[1], mo = +m[2], y = +m[3];
    if (y < 100) y += 2000;
    if (mo < 1 || mo > 12 || d < 1 || d > 31 || y < 2000 || y > 2100) return null;
    return `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  }

  const CIF_RE = /\b([ABCDEFGHJNPQRSUVW][-\s]?\d{7}[-\s]?[0-9A-J]|\d{8}[-\s]?[A-Z]|[XYZ][-\s]?\d{7}[-\s]?[A-Z])\b/g;
  const cleanCif = s => String(s).replace(/[-\s]/g, '').toUpperCase();

  // ---------- Cabecera ----------
  const GENERIC_TOP = /albar|factura|fecha|cliente|p[aá]gina|pag\.|tel[eé]f|tlf|fax|www\.|@|c\.?i\.?f|n\.?i\.?f|direcci|c\/|calle|avda|pol[ií]gono|c[oó]digo postal|original|duplicado|copia|n[ºo°]\b|destinatario|entrega|datos|pedido/i;

  function findNumero(lines) {
    const kw = /(?:albar[aá]n|factura|fra\.?|alb\.?)\s*(?:de\s+\w+\s+)?(?:n[ºo°*?.]{0,2}\s*[:.]?|num(?:ero)?\.?\s*[:.]?|:)?\s*([A-Za-z0-9][A-Za-z0-9\/\-.]{2,19})/i;
    const nn = /\bn[ºo°*?]\s*[:.]?\s*([A-Za-z0-9][A-Za-z0-9\/\-]{2,19})/i;
    for (const re of [kw, nn]) {
      for (const l of lines.slice(0, 40)) {
        const m = l.text.match(re);
        if (!m) continue;
        const v = m[1].replace(/[.\-\/]+$/, '');
        if (/\d/.test(v) && !parseDate(v) && !/^(?:cliente|fecha|pedido)/i.test(v) && !CIF_RE.test(' ' + v + ' ')) { CIF_RE.lastIndex = 0; return v; }
        CIF_RE.lastIndex = 0;
      }
    }
    return '';
  }

  function findFecha(lines) {
    for (const l of lines.slice(0, 40)) if (/fecha/i.test(l.text)) { const d = parseDate(l.text); if (d) return d; }
    for (const l of lines.slice(0, 40)) { const d = parseDate(l.text); if (d) return d; }
    return '';
  }

  function findCif(lines, ownCif) {
    const own = cleanCif(ownCif || '');
    for (const l of lines.slice(0, 60)) {
      for (const m of l.text.matchAll(CIF_RE)) {
        const c = cleanCif(m[1]);
        if (c !== own) return { cif: c, line: l };
      }
    }
    return { cif: '', line: null };
  }

  function findProveedor(lines, cifLine, known) {
    const all = norm(lines.map(l => l.text).join(' ')).replace(/[^a-z0-9 ]/g, ' ');
    for (const k of known || []) {
      const kn = norm(k).replace(/[^a-z0-9 ]/g, ' ').trim();
      if (kn.length >= 4 && all.includes(kn)) return k;
    }
    const top = lines.slice(0, 10).filter(l => letters(l.text) >= 4 && l.text.length <= 60 && !GENERIC_TOP.test(l.text));
    if (top.length) return top[0].text.replace(/[|_]+/g, ' ').replace(/\s+/g, ' ').trim();
    if (cifLine) return cifLine.text.replace(CIF_RE, '').replace(/\b(cif|nif)\b[:.\s]*/gi, '').trim();
    return '';
  }

  function lastAmount(text) {
    const toks = text.split(/\s+/).filter(Boolean).reverse();
    for (const t of toks) if (isNumTok(t)) return parseNum(t);
    return null;
  }

  function findTotales(lines) {
    let total = null, base = null, iva = null;
    for (const l of lines) {
      const t = norm(l.text);
      const v = lastAmount(l.text);
      if (v == null) continue;
      if (/\btotal\b/.test(t) && !/sub\s?total|base|iva|descuento|dto/.test(t)) total = v;
      else if (/base\s*imponible|sub\s?total|\bbase\b/.test(t)) base = base == null ? v : Math.max(base, v);
      else if (/\b(i\.?v\.?a\.?|cuota)\b/.test(t) && /\d/.test(t)) iva = v;
    }
    return { total, base, iva };
  }

  // ---------- Líneas de material ----------
  const HEADER_WORDS = /descripci|concepto|cantidad|\bcant\b|precio|importe|referencia|\bref\b|art[ií]culo|c[oó]digo|\buds?\b|\bunid|\bdto\b|dcto|desc\.|\bpvp\b|\btotal\b/;
  const FOOTER_RE = /^(total|sub\s?total|base\s*imp|i\.?v\.?a|forma de pago|vencimiento|observaciones|transportista|recib[ií]|firma|son:|suma|portes|importe total|total (albar|factura)|resumen)/i;
  const UNITS = /^(ud|uds|u|und|unid|unidad|unidades|m|ml|m2|m3|kg|kgs|l|lt|lts|pz|pza|pzas|rollo|rollos|caja|cajas|bolsa|bolsas|par|pares|juego|jgo)\.?$/i;

  const REF_RE = /^[A-Za-z0-9][A-Za-z0-9\-\/._]{2,}$/;
  const near = (a, b) => Math.abs(a - b) <= Math.max(0.02, Math.abs(b) * 0.015);

  // Interpreta un renglón de tabla: [ref] descripción cantidad [precio] [dto] [importe]. Valida cantidad × precio ≈ importe.
  function parseLineItem(text) {
    const tokens = text.replace(/[|¦_]+/g, ' ').split(/\s+/).filter(Boolean);
    if (!tokens.length) return null;
    const nums = [];
    let end = tokens.length;
    while (end > 0) {
      const t = tokens[end - 1];
      if (/^(€|eur|euros)$/i.test(t)) { end--; continue; }
      if (isNumTok(t)) { nums.unshift({ v: parseNum(t), pct: /%$/.test(t), raw: t }); end--; continue; }
      break;
    }
    let head = tokens.slice(0, end);
    const pct = nums.find(n => n.pct);
    const numsNoPct = nums.filter(n => !n.pct);
    let vals = numsNoPct.map(n => n.v);
    // Cantidad al principio ("2 uds Fotocélula ..."): solo si va seguida de unidad o se valida con precio e importe
    let qtyLead = null;
    if (head.length >= 2 && isNumTok(head[0]) && !/%$/.test(head[0])) {
      const n = parseNum(head[0]);
      if (n != null && n > 0 && n < 100000) qtyLead = n;
    }
    const leadHasUnit = qtyLead != null && UNITS.test(head[1] || '');
    // Busca la combinación cantidad × precio [dto] = importe entre las cifras del final
    const solve = vs => {
      if (vs.length >= 4) {
        const [a, b, c, e] = vs.slice(-4);
        if (c >= 0 && c <= 100 && near(a * b * (1 - c / 100), e)) return { q: a, p: b, d: c, imp: e };
      }
      if (vs.length >= 3) {
        const [a, b, c] = vs.slice(-3);
        if (near(a * b, c)) return { q: a, p: b, d: 0, imp: c };
        if (pct && near(a * b * (1 - pct.v / 100), c)) return { q: a, p: b, d: pct.v, imp: c };
      }
      if (vs.length >= 2 && qtyLead != null) {
        const [a, b] = vs.slice(-2);
        if (near(qtyLead * a, b)) return { q: qtyLead, p: a, d: 0, imp: b, lead: true };
      }
      return null;
    };
    let q = null, p = null, d = 0, imp = null, ok = false;
    let sol = solve(vals);
    if (!sol) {
      // El OCR pierde a veces la coma decimal ("3550" por "35,50"): se prueba a dividir entre 100 los enteros del final
      const first = Math.max(0, numsNoPct.length - 3);
      const pos = [];
      for (let i = first; i < numsNoPct.length; i++) if (/^\d{3,}$/.test(numsNoPct[i].raw)) pos.push(i);
      for (let mask = 1; mask < (1 << pos.length) && !sol; mask++) {
        const alt = vals.slice();
        pos.forEach((i, k) => { if (mask & (1 << k)) alt[i] = vals[i] / 100; });
        sol = solve(alt);
        if (sol) vals = alt;
      }
    }
    if (sol) {
      ({ q, p, d, imp } = sol); ok = true;
      if (sol.lead) { head = head.slice(1); if (UNITS.test(head[0] || '')) head = head.slice(1); }
    }    if (!ok && vals.length >= 3) { const [a, b, c] = vals.slice(-3); q = a; p = b; imp = c; }
    else if (!ok && vals.length === 2) { q = vals[0]; imp = vals[1]; p = q ? round2(imp / q) : null; }
    else if (!ok && vals.length === 1) {
      // albarán sin precios: cantidad al final; se exige una referencia para no confundir direcciones y teléfonos
      if (!(head.length >= 2 && REF_RE.test(head[0]) && /\d/.test(head[0]))) return null;
      q = vals[0]; ok = !/[.,]\d{2}$/.test(numsNoPct[numsNoPct.length - 1].raw);   // "73,00" parece un importe, no una cantidad
    } else if (!ok && vals.length === 0) {
      if (!leadHasUnit) return null;
      q = qtyLead; ok = true; head = head.slice(2);
    }
    if (q == null || !(q > 0)) return null;
    let ref = '';
    if (head.length >= 2 && REF_RE.test(head[0]) && /\d/.test(head[0]) && !UNITS.test(head[0])) { ref = head[0]; head = head.slice(1); }
    while (head.length && UNITS.test(head[head.length - 1])) head.pop();
    const descripcion = head.join(' ').replace(/^[^A-Za-z0-9ÁÉÍÓÚÑáéíóúñ(]+/, '').replace(/\s{2,}/g, ' ').trim();
    if (letters(descripcion) < 3) return null;
    if (!ok && (letters(descripcion) < 6 || /^(tel|tlf|fax|cif|nif|c\.?p\.?|m[oó]vil|iban|cuenta)\b/i.test(descripcion))) return null;
    return { ref, descripcion, cantidad: q, precio: p, dto: d, importe: imp, ok };
  }
  function parseLineas(lines, lineH) {
    // Zona de la tabla: tras la fila de cabecera (si se encontró) y antes del pie
    let start = 0;
    for (let i = 0; i < lines.length; i++) {
      const t = norm(lines[i].text);
      if ((t.match(new RegExp(HEADER_WORDS.source, 'g')) || []).length >= 2) { start = i + 1; break; }
    }
    const items = [];
    let pending = null; // texto sin cifras: puede ser el comienzo de la línea siguiente (lleva referencia) o la continuación de la anterior
    const refLike = t => /^[A-Za-z0-9][A-Za-z0-9\-\/._]{2,}$/.test(t.split(' ')[0]) && /\d/.test(t.split(' ')[0]);
    const flushPending = () => {
      const prev = items[items.length - 1];
      if (pending && prev && !pending.hasRef && (pending.y0 - prev._y1) < lineH * 1.4) {
        prev.descripcion += ' ' + pending.t; prev._y1 = pending.y1;
      }
      pending = null;
    };
    for (let i = start; i < lines.length; i++) {
      const l = lines[i];
      const t = l.text.trim();
      if (FOOTER_RE.test(norm(t)) && items.length) break;
      if (!t || letters(t) < 3 && !/\d/.test(t)) continue;
      const it = parseLineItem(t);
      if (it) {
        if (pending && pending.hasRef && !it.ref && (l.y0 - pending.y1) < lineH * 1.4) {
          const parts = pending.t.split(' ');
          it.ref = parts[0]; it.descripcion = (parts.slice(1).join(' ') + ' ' + it.descripcion).trim();
          pending = null;
        } else flushPending();
        items.push({ ...it, conf: it.ok ? (l.conf ?? 100) : Math.min(l.conf ?? 100, 50), raw: t, _y1: l.y1 });
        continue;
      }
      flushPending();
      if (letters(t) >= 3 && !/\d{2,}[.,]\d{2}\b/.test(t) && !GENERIC_TOP.test(t)) pending = { t: t.replace(/\s{2,}/g, ' '), y0: l.y0, y1: l.y1, hasRef: refLike(t) };
    }
    flushPending();
    return items.map(({ _y1, ok, ...r }) => r);
  }

  // lines: [{text, x0, y0, x1, y1, conf}] ordenadas por posición. opts: { ownCif, knownProveedores }
  function parseAlbaranLines(rawLines, opts) {
    opts = opts || {};
    const lines = rawLines
      .map(l => ({ ...l, text: String(l.text || '').replace(/\s+/g, ' ').trim() }))
      .filter(l => l.text)
      .sort((a, b) => (a.y0 - b.y0) || (a.x0 - b.x0));
    // Líneas que Tesseract/pdf.js parten en el mismo renglón se unen
    const merged = [];
    for (const l of lines) {
      const prev = merged[merged.length - 1];
      const h = Math.max(1, l.y1 - l.y0);
      if (prev && Math.abs((prev.y0 + prev.y1) / 2 - (l.y0 + l.y1) / 2) < h * 0.4 && l.x0 >= prev.x1 - 2) {
        prev.text += ' ' + l.text; prev.x1 = Math.max(prev.x1, l.x1); prev.y1 = Math.max(prev.y1, l.y1); prev.conf = Math.min(prev.conf ?? 100, l.conf ?? 100);
      } else merged.push({ ...l });
    }
    const hs = merged.map(l => l.y1 - l.y0).sort((a, b) => a - b);
    const lineH = hs.length ? hs[Math.floor(hs.length / 2)] : 20;
    const { cif, line: cifLine } = findCif(merged, opts.ownCif);
    const tot = findTotales(merged);
    return {
      proveedor: findProveedor(merged, cifLine, opts.knownProveedores),
      cif,
      numero: findNumero(merged),
      fecha: findFecha(merged),
      total: tot.total, base: tot.base, iva: tot.iva,
      lineas: parseLineas(merged, lineH)
    };
  }

  // ---------- Emparejado con el almacén ----------
  const STOP = new Set(['de', 'la', 'el', 'los', 'las', 'y', 'con', 'para', 'del', 'en', 'un', 'una', 'x', 'mm', 'ud', 'uds']);
  const tokensOf = s => norm(s).replace(/[^a-z0-9]+/g, ' ').split(' ').filter(t => t && !STOP.has(t) && (t.length > 1 || /\d/.test(t)));

  function similarity(a, b) {
    const A = new Set(tokensOf(a)), B = new Set(tokensOf(b));
    if (!A.size || !B.size) return 0;
    let inter = 0;
    for (const t of A) if (B.has(t)) inter++;
    let s = (2 * inter) / (A.size + B.size);
    // medidas y códigos (M8, 10x50, 220v) distintos => artículos distintos
    const numA = [...A].filter(t => /\d/.test(t)), numB = [...B].filter(t => /\d/.test(t));
    if ((numA.length || numB.length) && numA.some(t => !B.has(t)) && numB.some(t => !A.has(t))) s *= 0.5;
    return s;
  }

  function aliasId(proveedor, clave) {
    const s = nk(proveedor) + '|' + clave;
    let h = 5381;
    for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
    return 'ALI-' + (h >>> 0).toString(36).toUpperCase() + '-' + nk(proveedor).slice(0, 6).toUpperCase() + '-' + clave.slice(0, 12).toUpperCase();
  }
  const aliasKeys = l => [l.ref ? nk(l.ref) : '', nk(l.descripcion)].filter(Boolean);

  // Devuelve por línea: { articuloId, motivo: 'memoria'|'referencia'|'parecido'|'', score }
  function matchArticulos(lineas, articulos, proveedor, aliases) {
    const aliasMap = new Map((aliases || []).filter(a => nk(a.proveedor) === nk(proveedor)).map(a => [a.clave, a.articuloid ?? a.articuloId]));
    const byRef = new Map();
    for (const a of articulos) for (const k of [a.referencia, a.id].map(nk).filter(Boolean)) if (!byRef.has(k)) byRef.set(k, a);
    const byId = new Map(articulos.map(a => [String(a.id), a]));
    return lineas.map(l => {
      for (const k of aliasKeys(l)) {
        const id = aliasMap.get(k);
        if (id && byId.has(String(id))) return { articuloId: String(id), motivo: 'memoria', score: 1 };
      }
      if (l.ref) {
        const a = byRef.get(nk(l.ref));
        if (a) return { articuloId: String(a.id), motivo: 'referencia', score: 1 };
      }
      let best = null, bs = 0;
      for (const a of articulos) {
        const s = similarity(l.descripcion, a.nombre);
        if (s > bs) { bs = s; best = a; }
      }
      if (best && bs >= 0.7) return { articuloId: String(best.id), motivo: 'parecido', score: bs };
      return { articuloId: '', motivo: '', score: bs };
    });
  }

  function findDuplicado(entradas, proveedor, numero) {
    if (!numero || !proveedor) return null;
    return (entradas || []).find(e => nk(e.proveedor) === nk(proveedor) && nk(e.numero) === nk(numero)) || null;
  }

  // Suma de líneas frente a base/total del documento (con IVA 21 % por defecto). Devuelve { suma, esperado, cuadra }
  function cuadre(lineas, tot) {
    const suma = round2(lineas.reduce((s, l) => s + (l.importe != null ? l.importe : (l.precio || 0) * (l.cantidad || 0)), 0));
    const cands = [];
    if (tot.base != null) cands.push(tot.base);
    if (tot.total != null) { cands.push(tot.total); cands.push(round2(tot.total / 1.21)); if (tot.iva != null) cands.push(round2(tot.total - tot.iva)); }
    if (!cands.length || !suma) return { suma, esperado: null, cuadra: null };
    const ok = cands.some(c => Math.abs(c - suma) <= Math.max(0.05, c * 0.005));
    return { suma, esperado: cands[0], cuadra: ok };
  }

  // ---------- Lectura de imagen (OCR) ----------
  async function readAlbaranImage(worker, rgba, w, h, channels, host) {
    const progress = (host && host.onProgress) || (() => {});
    progress('Enderezando y limpiando la imagen…', 0.05);
    const img = root.FolioOCR.cleanForOCR(rgba, w, h, channels, { mask: false });
    progress('Leyendo el documento…', 0.2);
    // Texto disperso (11): en albaranes las columnas de cifras quedan lejos de la descripción y con 3/4 Tesseract las pierde;
    // el parser vuelve a unir por renglón los fragmentos que comparten línea base
    await worker.setParameters({ tessedit_pageseg_mode: '11' });
    const res = await worker.recognize(await host.encode(img.gray, img.width, img.height), {}, { blocks: true });
    progress('Interpretando…', 0.95);
    const lines = (res.data.lines || []).map(l => ({ text: l.text, x0: l.bbox.x0, y0: l.bbox.y0, x1: l.bbox.x1, y1: l.bbox.y1, conf: l.confidence }));
    return { lines, text: res.data.text || '' };
  }

  // ---------- Lectura de PDF (texto nativo; si es un escaneo, se rasteriza y pasa por OCR) ----------
  const PDFJS_URL = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js';
  const PDFJS_WORKER = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';

  function pdfItemsToLines(items, pageHeight, yOffset) {
    const rows = [];
    for (const it of items) {
      if (!it.str || !it.str.trim()) continue;
      const h = it.height || Math.abs(it.transform[3]) || 10;
      const x = it.transform[4], y = pageHeight - it.transform[5];
      let row = rows.find(r => Math.abs(r.y - y) < h * 0.5);
      if (!row) { row = { y, h, parts: [] }; rows.push(row); }
      row.parts.push({ x, x1: x + (it.width || 0), s: it.str });
    }
    return rows.sort((a, b) => a.y - b.y).map(r => {
      r.parts.sort((a, b) => a.x - b.x);
      let text = '';
      r.parts.forEach((p, i) => {
        if (i) text += (p.x - r.parts[i - 1].x1 > r.h * 0.25) ? ' ' : '';
        text += p.s;
      });
      return { text, x0: r.parts[0].x, x1: r.parts[r.parts.length - 1].x1, y0: yOffset + r.y - r.h, y1: yOffset + r.y, conf: 100 };
    });
  }

  async function readAlbaranPdf(file, host) {
    if (!root.pdfjsLib) await host.loadScript(PDFJS_URL);
    root.pdfjsLib.GlobalWorkerOptions.workerSrc = PDFJS_WORKER;
    const pdf = await root.pdfjsLib.getDocument({ data: await file.arrayBuffer() }).promise;
    const pages = Math.min(pdf.numPages, 4);
    let lines = [], offset = 0, scanned = false;
    const canvases = [];
    for (let p = 1; p <= pages; p++) {
      const page = await pdf.getPage(p);
      const vp = page.getViewport({ scale: 1 });
      const tc = await page.getTextContent();
      const pl = pdfItemsToLines(tc.items, vp.height, offset);
      if (pl.reduce((s, l) => s + l.text.length, 0) < 40) {
        scanned = true;
        const sv = page.getViewport({ scale: 2400 / vp.width });
        const c = host.createCanvas(Math.round(sv.width), Math.round(sv.height));
        await page.render({ canvasContext: c.getContext('2d'), viewport: sv }).promise;
        canvases.push(c);
      } else lines = lines.concat(pl);
      offset += vp.height + 50;
    }
    return { lines, scannedCanvases: scanned ? canvases : [], pages: pdf.numPages };
  }

  root.AlbaranOCR = {
    parseNum, parseDate, parseLineItem, parseAlbaranLines, similarity, aliasId, aliasKeys,
    matchArticulos, findDuplicado, cuadre, readAlbaranImage, readAlbaranPdf, pdfItemsToLines, nk
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = root.AlbaranOCR;
})(typeof window !== 'undefined' ? window : globalThis);
