let jsPDF; // se asigna al cargar jsPDF bajo demanda (ver ensurePdfLibs)

// Inserta una imagen dentro de un recuadro conservando su proporción y centrada.
function pdfAddImageContain(doc, data, x, y, w, h) {
    try {
        const props = doc.getImageProperties(data);
        const ratio = Math.min(w / props.width, h / props.height);
        const iw = props.width * ratio;
        const ih = props.height * ratio;
        doc.addImage(data, props.fileType || 'PNG', x + (w - iw) / 2, y + (h - ih) / 2, iw, ih);
    } catch (e) {
        try { doc.addImage(data, 'PNG', x, y, w, h); } catch (_) {}
    }
}

async function urlToCompressedJPEG(url, maxDim = 1200, quality = 0.7) {
    try {
        const response = await fetch(url);
        if (!response.ok) throw new Error('HTTP ' + response.status);
        const blob = await response.blob();
        const img = await new Promise((resolve, reject) => {
            const im = new Image();
            im.onload = () => resolve(im);
            im.onerror = reject;
            im.src = URL.createObjectURL(blob);
        });
        let { width, height } = img;
        if (width > maxDim || height > maxDim) {
            const scale = Math.min(maxDim / width, maxDim / height);
            width = Math.round(width * scale);
            height = Math.round(height * scale);
        }
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, width, height);
        ctx.drawImage(img, 0, 0, width, height);
        URL.revokeObjectURL(img.src);
        return canvas.toDataURL('image/jpeg', quality);
    } catch (err) {
        console.error('Error procesando imagen:', url, err);
        return null;
    }
}

// Misma identidad que la app (css/styles.css): azul noche + verde corporativo
const PDF_BRAND = {
  primary: [15,23,42],
  accent: [22,163,74],
  accentDark: [21,128,61],
  panel: [240,253,244],
  panelBorder: [187,247,208],
  card: [248,250,252],
  cardBorder: [226,232,240],
  shadow: [203,213,225],
  shadowStrong: [148,163,184],
  soft: [241,245,249],
  text: [15,23,42],
  muted: [100,116,139],
  white: [255,255,255],
  warn: [254,243,199],
  warnBorder: [252,211,77],
  warnText: [120,53,15],
  success: [220,252,231],
  danger: [254,226,226]
};

let _companyLogoPromise = null;
function getCompanyLogoDataUrl() {
  if (!_companyLogoPromise) _companyLogoPromise = loadCompanyLogoDataUrl();
  return _companyLogoPromise;
}

async function loadCompanyLogoDataUrl() {
  // 1º: imagen corporativa propia (logo-empresa.png en la carpeta del proyecto).
  // 2º: icono de la app como respaldo. Solo se intentan URLs que existan (evita 404 en consola)
  const candidates = [
    './logo-empresa.png',
    'logo-empresa.png',
    './icons/icon-512.png',
    './icons/icon-192.png',
    '/icons/icon-512.png',
    '/icons/icon-192.png',
    'icons/icon-512.png',
    'icons/icon-192.png'
  ];

  for (const url of candidates) {
    try {
      const probe = await fetch(url, { method: 'HEAD' });
      if (!probe.ok) continue;
    } catch (_) { continue; }
    try {
      const response = await fetch(url, { cache: 'no-store' });
      if (!response.ok) continue;
      const blob = await response.blob();
      if (!blob || !blob.type.startsWith('image/')) continue;
      return await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result);
        reader.onerror = () => reject(new Error('No se pudo leer el logo'));
        reader.readAsDataURL(blob);
      });
    } catch (err) {
      console.warn('Logo no disponible:', url, err);
    }
  }

  return null;
}

function createPDF(title, subtitle = 'Gestión de Puertas Automáticas', statusText = null, statusColor = null, logo = null){
  const doc = new jsPDF();
  const p = PDF_BRAND.primary;
  const a = statusColor || PDF_BRAND.accent;
  const textX = logo ? 43 : 20;

  doc.setFillColor(PDF_BRAND.shadow[0], PDF_BRAND.shadow[1], PDF_BRAND.shadow[2]);
  doc.roundedRect(15.2, 7.4, 182, 25, 3, 3, 'F');
  doc.setFillColor(PDF_BRAND.panel[0], PDF_BRAND.panel[1], PDF_BRAND.panel[2]);
  doc.setDrawColor(PDF_BRAND.panelBorder[0], PDF_BRAND.panelBorder[1], PDF_BRAND.panelBorder[2]);
  doc.setLineWidth(0.45);
  doc.roundedRect(14, 6, 182, 25, 3, 3, 'FD');
  if (logo) {
    doc.setFillColor(255, 255, 255);
    doc.setDrawColor(PDF_BRAND.panelBorder[0], PDF_BRAND.panelBorder[1], PDF_BRAND.panelBorder[2]);
    doc.roundedRect(19, 9.5, 18, 18, 3.5, 3.5, 'FD');
    try { doc.addImage(logo, 'PNG', 20.8, 11.3, 14.4, 14.4); }
    catch (err) { console.warn('No se pudo cargar el logo en el PDF:', err); }
  }
  doc.setTextColor(p[0], p[1], p[2]);
  doc.setFontSize(18);
  doc.setFont(undefined, 'bold');
  doc.text('VALGOM', textX, 22.5);
  doc.setFontSize(8);
  doc.setFont(undefined, 'bold');
  doc.setTextColor(PDF_BRAND.accentDark[0], PDF_BRAND.accentDark[1], PDF_BRAND.accentDark[2]);
  doc.text(title, 190, 17.5, { align: 'right' });
  doc.setFont(undefined, 'normal');
  doc.setTextColor(PDF_BRAND.muted[0], PDF_BRAND.muted[1], PDF_BRAND.muted[2]);
  doc.text(formatDate(new Date().toISOString()), 190, 24, { align: 'right' });

  if (statusText) {
    doc.setFillColor(a[0], a[1], a[2]);
    doc.roundedRect(92, 12, 42, 10, 5, 5, 'F');
    doc.setTextColor(255,255,255);
    doc.setFontSize(7.5);
    doc.setFont(undefined, 'bold');
    doc.text(String(statusText).toUpperCase(), 113, 18.4, { align: 'center' });
  }

  doc.setTextColor(PDF_BRAND.text[0], PDF_BRAND.text[1], PDF_BRAND.text[2]);
  return doc;
}

async function createBrandedPDF(title, subtitle, statusText, statusColor, sinLogo = false, sinCabecera = false){
  // jsPDF/autotable se cargan bajo demanda; sin esto falla "jsPDF is not defined"
  await window.ensurePdfLibs();
  jsPDF = window.jspdf.jsPDF;
  const logo = sinLogo ? null : await getCompanyLogoDataUrl();
  const doc = createPDF(title, subtitle, statusText, statusColor, logo);
  if(sinCabecera){
    // Eliminar la franja de cabecera: página en blanco para dibujar desde arriba
    doc.deletePage(1);
    doc.addPage();
  }
  return doc;
}
window.createBrandedPDF = createBrandedPDF;
window.getCompanyLogoDataUrl = getCompanyLogoDataUrl;

function addPDFFooter(doc,page){
  const totalPages = doc.internal.getNumberOfPages();
  const h = doc.internal.pageSize.height;
  doc.setDrawColor(PDF_BRAND.cardBorder[0], PDF_BRAND.cardBorder[1], PDF_BRAND.cardBorder[2]);
  doc.setLineWidth(0.3);
  doc.line(14, h-13, 196, h-13);
  doc.setFontSize(8);
  doc.setFont(undefined,'normal');
  doc.setTextColor(PDF_BRAND.muted[0], PDF_BRAND.muted[1], PDF_BRAND.muted[2]);
  doc.text('Valgom — Documento generado automáticamente',14,h-8);
  doc.text('Página '+page+' de '+totalPages,196,h-8,{align:'right'});
}

function addPDFFootersAllPages(doc){
  for(let page=1;page<=doc.internal.getNumberOfPages();page++){doc.setPage(page);addPDFFooter(doc,page);}
}

function pdfSectionTitle(doc, texto, y){
  pdfBox(doc,14,y,182,10,PDF_BRAND.panel,PDF_BRAND.panelBorder);
  pdfCardHeading(doc,texto,20,y+6.5);
  return y+14;
}

// Tarjeta con sombra suave y borde fino
function pdfBox(doc, x, y, w, h, fillColor = PDF_BRAND.panel, borderColor = PDF_BRAND.panelBorder, shadowColor = PDF_BRAND.shadow){
  // Todas las tarjetas comparten el estilo del encabezado (verde suave); solo se respetan los colores semánticos (avisos, éxito…)
  if (fillColor === PDF_BRAND.card || fillColor === PDF_BRAND.soft || fillColor === PDF_BRAND.white) fillColor = PDF_BRAND.panel;
  if (borderColor === PDF_BRAND.cardBorder) borderColor = PDF_BRAND.panelBorder;
  if (shadowColor === PDF_BRAND.shadowStrong) shadowColor = PDF_BRAND.shadow;
  doc.setFillColor(shadowColor[0],shadowColor[1],shadowColor[2]);
  doc.roundedRect(x+1.8,y+2,w,h,3,3,'F');   // sombra ancha (1.8mm) para dar profundidad
  doc.roundedRect(x+0.9,y+1,w,h,3,3,'F');   // segunda capa: sombra más suave
  doc.setFillColor(fillColor[0],fillColor[1],fillColor[2]);
  doc.setLineWidth(0.55);
  doc.setDrawColor(borderColor[0],borderColor[1],borderColor[2]);
  doc.roundedRect(x,y,w,h,3,3,'FD');
}

function pdfCardHeading(doc,text,x,y){
  doc.setFontSize(9);
  doc.setFont(undefined,'bold');
  doc.setTextColor(PDF_BRAND.accentDark[0],PDF_BRAND.accentDark[1],PDF_BRAND.accentDark[2]);
  doc.text(String(text).toUpperCase(),x,y);
  doc.setFont(undefined,'normal');
}

// Campo etiqueta/valor (y = línea base del valor)
function pdfField(doc, label, value, x, y, maxW = 80){
  doc.setFontSize(7);
  doc.setFont(undefined,'normal');
  doc.setTextColor(PDF_BRAND.muted[0],PDF_BRAND.muted[1],PDF_BRAND.muted[2]);
  doc.text(String(label).toUpperCase(),x,y-3);
  doc.setFontSize(9.5);
  doc.setFont(undefined,'bold');
  doc.setTextColor(PDF_BRAND.text[0],PDF_BRAND.text[1],PDF_BRAND.text[2]);
  const txt = doc.splitTextToSize(String(value ?? '—') || '—', maxW)[0];
  doc.text(txt,x,y+1);
  doc.setFont(undefined,'normal');
}

// Tarjeta individual con un campo dentro
function pdfInfoCard(doc, label, value, x, y, w, h = 15){
  pdfBox(doc,x,y,w,h);
  pdfField(doc,label,value,x+5,y+h-5.5,w-10);
}

// Tarjeta de texto libre (descripción, notas); devuelve la altura usada
function pdfTextCard(doc, text, x, y, w, fill = PDF_BRAND.card, border = PDF_BRAND.cardBorder, color = PDF_BRAND.text){
  const lines = doc.splitTextToSize(String(text||'—'), w-12);
  const h = Math.max(16, lines.length*4.8+10);
  pdfBox(doc,x,y,w,h,fill,border);
  doc.setFontSize(9.5);
  doc.setFont(undefined,'normal');
  doc.setTextColor(color[0],color[1],color[2]);
  doc.text(lines,x+6,y+8);
  return h;
}

function pdfTitledTextCard(doc,title,text,x,y,w,fill=PDF_BRAND.card,border=PDF_BRAND.cardBorder,color=PDF_BRAND.text){
  const lines=doc.splitTextToSize(String(text||'—'),w-12);
  const h=Math.max(25,lines.length*4.8+21);
  pdfBox(doc,x,y,w,h,fill,border);
  pdfCardHeading(doc,title,x+6,y+8);
  doc.setFontSize(9.5);
  doc.setFont(undefined,'normal');
  doc.setTextColor(color[0],color[1],color[2]);
  doc.text(lines,x+6,y+17);
  return h;
}

function pdfTableStyle(extra = {}){
  const p = PDF_BRAND.primary, s = PDF_BRAND.panel, b = PDF_BRAND.panelBorder;
  return Object.assign({
    theme:'striped',
    margin:{left:14,right:14,bottom:18},
    headStyles:{fillColor:p,textColor:255,fontSize:8,fontStyle:'bold',cellPadding:3},
    bodyStyles:{fontSize:8,cellPadding:2.8,textColor:PDF_BRAND.text,lineColor:b,lineWidth:0.1},
    alternateRowStyles:{fillColor:s}
  }, extra);
}

const ESTADO_COLOR = {
  abierto: [234,88,12], en_ruta: [37,99,235],
  en_taller: [217,119,6], completado: [22,163,74]
};

// ─── Convertir firma base64 PNG a formato que acepta jsPDF ───
async function firmaToPDF(firmaDataURL){
  if(!firmaDataURL) return null;
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  const img = new Image();
  img.src = firmaDataURL;
  await new Promise((resolve,reject)=>{
    img.onload = resolve;
    img.onerror = reject;
  });
  // Escalar para que quepa en el espacio del PDF (70mm ancho)
  const maxW = 70;
  const scale = Math.min(maxW / img.width, 25 / img.height, 1);
  canvas.width = Math.round(img.width * scale);
  canvas.height = Math.round(img.height * scale);
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  // Convertir a JPEG para que jsPDF lo acepte sin problemas
  return canvas.toDataURL('image/jpeg', 0.8);
}

window.seedDemoPDFData = async function(){
  const clienteId = 'CLI-DEMO-001';
  const presupuestoId = 'PRE-DEMO-001';
  const parteId = 'PT-DEMO-001';
  const revisionId = 'REV-DEMO-001';

  const demoCliente = {
    id: clienteId,
    nombre: 'Supermercados Norte S.L.',
    tipo: 'empresa',
    contacto: 'Ana García',
    email: 'ana@supnorte.es',
    telefono: '948 123 456',
    direccion: 'Calle Mayor 14, Vitoria-Gasteiz',
    dni: 'B12345678',
    nota: 'Grupo demo para pruebas de impresión PDF.'
  };

  const demoEmpleado = {
    id: 'EMP-DEMO-001',
    nombre: 'Laura Martín',
    dni: '78945612L',
    cargo: 'Técnica de mantenimiento',
    telefono: '600 111 222',
    email: 'laura@autopuerta.es'
  };

  const demoPuertas = [
    { id: 'PU-DEMO-001', nombre: 'Acceso principal', tipo: 'Seccional', clienteId, estado: 'ok' },
    { id: 'PU-DEMO-002', nombre: 'Entrada del almacén', tipo: 'Seccional', clienteId, estado: 'ok' }
  ];

  const demoParte = {
    id: parteId,
    clienteId,
    clienteNombre: demoCliente.nombre,
    clienteDni: demoCliente.dni,
    empleadoNombre: demoEmpleado.nombre,
    empleadoDni: demoEmpleado.dni,
    ubicacionNombre: 'Centro comercial Norte',
    ubicacionDireccion: 'Calle Mayor 14, Vitoria-Gasteiz',
    puertaIds: demoPuertas.map(p => p.id),
    tipoPuerta: 'Seccional',
    kms: 148,
    horas: 6.5,
    fecha: '2026-10-09',
    descripcion: 'Inspección general de automatismos, ajuste de cierre y comprobación de sensores para acceso principal y almacén.',
    notas: 'Se sustituyó el sensor de cierre y se reprogramó la velocidad de apertura para mejorar la fluidez del paso.\nSe recomienda revisión en 6 meses.',
    estado: 'completado',
    fotos: []
  };

  const demoPresupuesto = {
    id: presupuestoId,
    clienteId,
    clienteNombre: demoCliente.nombre,
    fecha: '2026-10-08',
    validoHasta: '2026-10-31',
    estado: 'aceptado',
    subtotal: 980,
    iva: 205.8,
    total: 1185.8,
    lineItems: [
      { descripcion: 'Mantenimiento automatismo acceso principal', tipoId: 'MANT', cantidad: 1, precio: 520 },
      { descripcion: 'Ajuste sistema seguridad y sensores', tipoId: 'SEG', cantidad: 1, precio: 260 },
      { descripcion: 'Revisión y puesta a punto general', tipoId: 'REV', cantidad: 1, precio: 200 }
    ],
    notas: 'Incluye mano de obra y revisión de seguridad, sin IVA incluido desde la factura final.'
  };

  const demoRevision = {
    id: revisionId,
    fecha: '2026-10-09',
    tecnicoNombre: demoEmpleado.nombre,
    tecnicoId: demoEmpleado.id,
    items: [
      { concepto: 'Acceso principal', tipoPuerta: 'Seccional', hallazgo: 'Ajuste correcto de velocidad', correctivo: 'Revisado y ajustado', resultado: 'OK' },
      { concepto: 'Entrada almacén', tipoPuerta: 'Seccional', hallazgo: 'Sensor ligeramente desalineado', correctivo: 'Recalibrado sensor', resultado: 'OK' }
    ],
    notas: JSON.stringify({
      cadena: demoCliente.nombre,
      cliente: demoCliente.nombre,
      supermercados: [{ nombre: demoCliente.nombre }],
      intervencion: 'Mantenimiento rutinario preventivo',
      contrato: 'CT-2026-114',
      observaciones: 'Se deja todo el sistema en perfecto funcionamiento.',
      tecnicos: demoEmpleado.nombre
    })
  };

  const demoAlmacen = {
    id: 'ART-DEMO-001',
    referencia: 'A-PT-230',
    nombre: 'Kit de sensor de cierre',
    categoria: 'Accesorios',
    unidad: 'ud',
    stock: 12,
    stockMinimo: 4,
    precioCompra: 34.5,
    precioVenta: 58,
    proveedor: 'FerroPuertas Iberia'
  };

  const upserts = [
    ['clientes', demoCliente],
    ['empleados', demoEmpleado],
    ['puertas', demoPuertas[0]],
    ['puertas', demoPuertas[1]],
    ['partesTrabajo', demoParte],
    ['presupuestos', demoPresupuesto],
    ['revisiones', demoRevision],
    ['almacen', demoAlmacen]
  ];

  for (const [store, item] of upserts) {
    try {
      const existing = await dbGet(store, item.id);
      if (!existing) {
        await dbPut(store, item);
      } else {
        await dbPut(store, { ...existing, ...item });
      }
    } catch (err) {
      console.warn('No se pudo guardar la demo para', store, err);
    }
  }

  return { clienteId, presupuestoId, parteId, revisionId };
};

window.generateDemoPDFPack = async function(){
  const demoIds = await window.seedDemoPDFData();
  await window.generatePDF_clientes(demoIds.clienteId);
  await window.generatePDF_presupuesto(demoIds.presupuestoId);
  await window.generatePDF_partes(demoIds.parteId);
  await window.generatePDF_revision(demoIds.revisionId);
  await window.generatePDF_almacen();
  await window.generatePDF_presupuestos();
  showToast('Pack de PDFs demo generado');
  return demoIds;
};

window.generatePDF_clientes = async function(id){
  const c = await dbGet('clientes',id);
  if(!c){showToast('Cliente no encontrado','error');return}

  const doc = await createBrandedPDF('Ficha de Cliente');
  const X = 14, W = 182, half = 88, gap = 6;
  let y = 42;

  // Cabecera de cliente destacada
  pdfBox(doc, X, y, W, 24, PDF_BRAND.panel, PDF_BRAND.panelBorder);
  doc.setTextColor(PDF_BRAND.primary[0],PDF_BRAND.primary[1],PDF_BRAND.primary[2]);
  doc.setFontSize(17); doc.setFont(undefined,'bold');
  doc.text(String(c.nombre || 'Cliente'), X+8, y+11, { maxWidth: W-16 });
  doc.setFontSize(9); doc.setFont(undefined,'normal');
  doc.setTextColor(PDF_BRAND.muted[0],PDF_BRAND.muted[1],PDF_BRAND.muted[2]);
  doc.text(c.tipo === 'empresa' ? 'Empresa' : 'Particular', X+8, y+18);
  y += 34;

  y = pdfSectionTitle(doc,'Datos de contacto',y);
  pdfInfoCard(doc,'Contacto',c.contacto||'—',X,y,half);
  pdfInfoCard(doc,'Teléfono',c.telefono||'—',X+half+gap,y,half);
  y += 21;
  pdfInfoCard(doc,'Email',c.email||'—',X,y,half);
  pdfInfoCard(doc,'DNI/NIF',c.dni||'—',X+half+gap,y,half);
  y += 21;
  pdfInfoCard(doc,'Dirección',c.direccion||'—',X,y,W);
  y += 25;

  if (c.nota) {
    y = pdfTitledTextCard(doc,'Notas',c.nota,X,y,W,PDF_BRAND.warn,PDF_BRAND.warnBorder,PDF_BRAND.warnText)+8;
  }

  addPDFFootersAllPages(doc);
  doc.save('cliente_' + String(c.nombre || c.id || 'sin-nombre').replace(/[^a-zA-Z0-9_-]/g,'_') + '.pdf');
  showToast('PDF de cliente generado');
};

window.generatePDF_presupuesto = async function(id, opts){
  const p = await dbGet('presupuestos',id);
  if(!p){showToast('Presupuesto no encontrado','error');return}
  const doc = await createBrandedPDF('Presupuesto', '', null, null, true, true); // sin franja: layout estilo presupuesto clásico
  const company=typeof window.getCompanySettings==='function'
    ? await window.getCompanySettings()
    : {trade_name:'Valgom'};
  const logo = await getCompanyLogoDataUrl();
  const X = 14, W = 182;
  let y = 14;

  // Cargar datos del cliente para su tarjeta
  let cliente = null;
  try{ cliente = p.clienteId ? await dbGet('clientes',p.clienteId) : null; }catch(_){ }

  // ══ LAYOUT ESTILO PRESUPUESTO CLÁSICO (según modelopresupuesto.png) ══
  // ── CABECERA: logo a la izquierda + datos de empresa al centro + caja cliente a la derecha ──
  const cabH = 42;
  pdfBox(doc,X,y,W,cabH,PDF_BRAND.white,PDF_BRAND.panelBorder);
  if(logo){
    try{ doc.addImage(logo,'PNG',X+6,y+6,26,26); }
    catch(err){ try{ pdfAddImageContain(doc,logo,X+6,y+6,26,26); }catch(_){}}
  }
  doc.setFontSize(13); doc.setFont(undefined,'bold');
  doc.setTextColor(PDF_BRAND.text[0],PDF_BRAND.text[1],PDF_BRAND.text[2]);
  doc.text(company.trade_name||company.legal_name||'VALGOM',X+36,y+12);
  doc.setFontSize(7.5); doc.setFont(undefined,'normal');
  doc.setTextColor(PDF_BRAND.muted[0],PDF_BRAND.muted[1],PDF_BRAND.muted[2]);
  let dy=y+18;
  if(company.legal_name) { doc.text(String(company.legal_name).slice(0,58),X+36,dy); dy+=4; }
  if(company.tax_id){ doc.text('CIF: '+company.tax_id,X+36,dy); dy+=4; }
  if(company.address){ doc.text(String(company.address).slice(0,58),X+36,dy); dy+=4; }
  if(company.phone){ doc.text('Tel. '+company.phone+(company.email?'  ·  '+company.email:''),X+36,dy); dy+=4; }
  if(company.website){ doc.text(String(company.website),X+36,dy); dy+=4; }

  // Caja del cliente a la derecha (estilo tarjetita del modelo), centrada verticalmente
  // Con nombre largo: el nombre corta con "..." controlado y el resto de datos caben
  const cliBoxW = 68, cliBoxX = X+W-cliBoxW-6, cliBoxH = 38;
  const cliBoxY = y + (cabH - cliBoxH) / 2; // centrada con respecto a la cabecera
  pdfBox(doc,cliBoxX,cliBoxY,cliBoxW,cliBoxH,PDF_BRAND.card,PDF_BRAND.cardBorder,PDF_BRAND.shadowStrong);
  doc.setFontSize(6.5); doc.setFont(undefined,'bold');
  doc.setTextColor(PDF_BRAND.muted[0],PDF_BRAND.muted[1],PDF_BRAND.muted[2]);
  doc.text('CLIENTE',cliBoxX+4,cliBoxY+6);
  doc.setFontSize(9); doc.setFont(undefined,'bold');
  doc.setTextColor(PDF_BRAND.text[0],PDF_BRAND.text[1],PDF_BRAND.text[2]);
  // Nombre en 2 líneas máximo con recorte controlado
  const nomLines = doc.splitTextToSize(String(p.clienteNombre||'—'), cliBoxW-8).slice(0,2);
  nomLines.forEach((ln,i)=>doc.text(ln,cliBoxX+4,cliBoxY+11+i*4.4));
  doc.setFontSize(6.8); doc.setFont(undefined,'normal');
  doc.setTextColor(PDF_BRAND.muted[0],PDF_BRAND.muted[1],PDF_BRAND.muted[2]);
  let gy = cliBoxY + 11 + nomLines.length*4.4 + 1.5;
  const put = (lbl, val) => {
    if(!val) return;
    doc.text(lbl + ': ' + String(val).slice(0,40), cliBoxX+4, gy, {maxWidth:cliBoxW-8});
    gy += 4.6;
  };
  put('NIF', cliente?.dni);
  put('Tel', cliente?.telefono);
  put('Dir', cliente?.direccion);

  y += cabH + 7;

  // ── FRANJA DE DATOS: FECHA · Nº · VALIDEZ · CONTACTO · ESTADO ──
  const franjaH = 16;
  pdfBox(doc,X,y,W,franjaH,PDF_BRAND.panel,PDF_BRAND.panelBorder);
  doc.setFontSize(6.5); doc.setFont(undefined,'bold');
  doc.setTextColor(PDF_BRAND.muted[0],PDF_BRAND.muted[1],PDF_BRAND.muted[2]);
  const franjaCampos = [['FECHA',formatDate(p.fecha)],['Nº PRESUPUESTO',p.id||'—'],['VÁLIDO HASTA',formatDate(p.validoHasta)],['PLAZO ENTREGA',p.plazoEntrega||'—'],['CONTACTO',cliente?.contacto||'—'],['ESTADO',getStatusLabel(p.estado)||p.estado||'—']];
  const paso = (W-12)/franjaCampos.length;
  franjaCampos.forEach((campo,i)=>{
    const fx = X+6+i*paso;
    doc.text(campo[0],fx,y+7);
    doc.setFont(undefined,'normal'); doc.setFontSize(8.2);
    doc.setTextColor(PDF_BRAND.text[0],PDF_BRAND.text[1],PDF_BRAND.text[2]);
    doc.text(String(campo[1]||'—').slice(0,24),fx,y+12.5,{maxWidth:paso-3});
    doc.setFont(undefined,'bold'); doc.setFontSize(6.5);
    doc.setTextColor(PDF_BRAND.muted[0],PDF_BRAND.muted[1],PDF_BRAND.muted[2]);
  });
  y += franjaH + 8;

  // ── TABLA DE LÍNEAS (estilo del modelo: con columna Código; tipo con nombre legible) ──
  let tiposPuertaMap = new Map();
  try{ (await window.TiposPuerta.filasDB()).forEach(t => tiposPuertaMap.set(t.id, t.nombre)); }catch(_){ }
  if(p.lineItems && p.lineItems.length>0){
    const tableData = p.lineItems.map((item,i)=>{
      const tipoNombre = tiposPuertaMap.get(item.tipoId) || item.tipoId || '—';
      return [String(i+1).padStart(2,'0'),item.descripcion||'—',String(item.ref||''),tipoNombre,item.cantidad,formatCurrency(item.precio),formatCurrency(item.cantidad*item.precio)];
    });
    doc.autoTable(pdfTableStyle({startY:y,head:[['Código','Descripción','REF','Tipo','Cant.','P. Unitario','Importe']],body:tableData,columnStyles:{0:{cellWidth:14,halign:'center'},2:{cellWidth:18},3:{cellWidth:24},4:{cellWidth:12,halign:'center'},5:{cellWidth:26,halign:'right'},6:{cellWidth:26,halign:'right'}}}));
    y = doc.lastAutoTable.finalY;
  }

  // ── Totales SIEMPRE en la parte baja de la página ──
  const pageH = doc.internal.pageSize.getHeight();
  const th = 42;
  const totalsY = Math.max(y + 10, pageH - th - 16); // anclado abajo (tarjeta 42mm + pie)
  if(totalsY > y){ y = totalsY; }

  // ── Desglose de totales: tarjeta a ancho completo anclada abajo ──
  pdfBox(doc,X,y,W,th);
  let ty=y+10;
  doc.setFontSize(9.5); doc.setFont(undefined,'normal');
  doc.setTextColor(PDF_BRAND.muted[0],PDF_BRAND.muted[1],PDF_BRAND.muted[2]);
  doc.text('Subtotal',X+8,ty);
  doc.text('IVA (21%)',X+8,ty+6.5);
  doc.setTextColor(PDF_BRAND.text[0],PDF_BRAND.text[1],PDF_BRAND.text[2]);
  doc.text(formatCurrency(p.subtotal||0),X+W-8,ty,{align:'right'});
  doc.text(formatCurrency(p.iva||0),X+W-8,ty+6.5,{align:'right'});
  // Banda del total destacada
  doc.setFillColor(PDF_BRAND.accent[0],PDF_BRAND.accent[1],PDF_BRAND.accent[2]);
  doc.roundedRect(X+5,y+20,W-10,17,3,3,'F');
  doc.setTextColor(255,255,255); doc.setFont(undefined,'bold'); doc.setFontSize(12);
  doc.text('TOTAL',X+12,y+31.5);
  doc.text(formatCurrency(p.total||0),X+W-12,y+31.5,{align:'right'});
  y += th + 8;

  // ── Observaciones / condiciones (estilo del modelo: bloque de texto bajo los totales) ──
  const notasPres = String(p.notas||'').trim();
  if(notasPres){
    const linesNotas = doc.splitTextToSize(notasPres, W-16);
    const nh = 10 + linesNotas.length*4.4 + 4;
    pdfBox(doc,X,Math.min(y,pageH-nh-16),W,nh,PDF_BRAND.card,PDF_BRAND.cardBorder);
    doc.setFontSize(6.5); doc.setFont(undefined,'bold'); doc.setTextColor(PDF_BRAND.muted[0],PDF_BRAND.muted[1],PDF_BRAND.muted[2]);
    doc.text('OBSERVACIONES',X+8,Math.min(y,pageH-nh-16)+7);
    doc.setFontSize(8.2); doc.setFont(undefined,'normal'); doc.setTextColor(PDF_BRAND.text[0],PDF_BRAND.text[1],PDF_BRAND.text[2]);
    doc.text(linesNotas,X+8,Math.min(y,pageH-nh-16)+13);
    y = Math.min(y,pageH-nh-16) + nh + 6;
  }

  // ── Hoja de medidas rellena (página extra) ──
  if(p.medidasPlanta && p.medidasPlanta.sistema==='hoja-v1' && (p.medidasPlanta.imagenUrl || p.medidasPlanta.svg)){
    doc.addPage();
    doc.setFontSize(14); doc.setFont(undefined,'bold'); doc.setTextColor(PDF_BRAND.text[0],PDF_BRAND.text[1],PDF_BRAND.text[2]);
    doc.text('Hoja de medidas — ' + (p.medidasPlanta.tipoNombre||''), 14, 18);
    doc.setFontSize(9); doc.setFont(undefined,'normal');
    doc.setTextColor(PDF_BRAND.muted[0],PDF_BRAND.muted[1],PDF_BRAND.muted[2]);
    doc.text('Cliente: ' + (p.clienteNombre||'—') + '   ·   Fecha: ' + (p.medidasPlanta.fecha||'—') + '   ·   Técnico: ' + (p.medidasPlanta.tecnico||'—'), 14, 25);
    const notasMedidas = String(p.medidasPlanta.notas || '').trim();
    if(notasMedidas) doc.text(doc.splitTextToSize('Observaciones: '+notasMedidas,182),14,30);
    try{
      // La hoja se dibuja con el mismo motor que la pantalla (valores dentro de sus casillas, marcas, repeticiones)
      const dataUrl = await window.HOJA_MEDIDAS.renderizar(p.medidasPlanta, 1500);
      const props = doc.getImageProperties(dataUrl);
      const maxW = 182, maxH = notasMedidas ? 230 : 245, escala = Math.min(maxW/props.width,maxH/props.height);
      const imgW = props.width*escala, imgH = props.height*escala;
      const imgX = 14+(maxW-imgW)/2, imgY = notasMedidas ? 40 : 32;
      doc.addImage(dataUrl, props.fileType, imgX, imgY, imgW, imgH, undefined, 'FAST');
    }catch(e){ console.warn('Hoja de medidas en PDF:', e); }
  }
  addPDFFootersAllPages(doc);
  const fileName = 'presupuesto_'+p.id+'.pdf';
  if(opts && opts.asFile){
    return new File([doc.output('blob')], fileName, {type:'application/pdf'});
  }
  doc.save(fileName); showToast('PDF de presupuesto generado');
};

window.generatePDF_partes = async function(id){
  const p = await dbGet('partesTrabajo', id);
  if(!p){showToast('Parte no encontrado','error');return}

  // ── CARGAR PUERTAS (Paso 7.4) ──
  let puertasTexto = '—';
  if(p.puertaIds && p.puertaIds.length > 0){
    const puertas = await dbGetAll('puertas');
    const mapP = Object.fromEntries(puertas.map(x => [x.id, x.nombre]));
    puertasTexto = p.puertaIds.map(id => mapP[id] || id).join(', ');
  }

  const companyLogo = await getCompanyLogoDataUrl();
  const fechaTxt = (typeof formatDate === 'function') ? formatDate(p.fecha) : (p.fecha||'');
  let clienteDireccion = String(p.clienteDireccion || '');
  let clienteFicha = null; // ficha completa del cliente (para el sello en el PDF)
  let ubicacionNombre = String(p.ubicacionNombre || '');
  let ubicacionDireccion = String(p.ubicacionDireccion || '');
  if(p.clienteId){
    try{
      clienteFicha = await dbGet('clientes', p.clienteId);
      clienteDireccion = clienteDireccion || String(clienteFicha?.direccion||'');
    }
    catch(error){console.warn('No se pudo cargar la dirección del cliente para el PDF:',error);}
  }
  if(p.ubicacionId && (!ubicacionNombre || !ubicacionDireccion)){
    try{
      const ubicacion=await dbGet('ubicaciones',p.ubicacionId);
      ubicacionNombre=ubicacionNombre||String(ubicacion?.denominacion||ubicacion?.nombre||'');
      ubicacionDireccion=ubicacionDireccion||String(ubicacion?.direccion||'');
    }catch(error){console.warn('No se pudo cargar la ubicación para el PDF:',error);}
  }

  // ── Cabecera ──
  const doc = createPDF('Parte de trabajo', 'Parte de trabajo', null, null, companyLogo);
  let y = 40;

  // ── Resumen del parte ──
  const addressLines=clienteDireccion?doc.splitTextToSize(clienteDireccion,88):[];
  const locationLines=ubicacionNombre?doc.splitTextToSize(ubicacionNombre,88):[];
  let clientDetailsY=y+22;
  if(addressLines.length) clientDetailsY+=4+addressLines.length*4+2;
  if(locationLines.length) clientDetailsY+=4+locationLines.length*4+2;
  const summaryHeight=Math.max(42,clientDetailsY-y+2);
  pdfBox(doc, 14, y, 182, summaryHeight, PDF_BRAND.panel, PDF_BRAND.panelBorder);
  pdfCardHeading(doc,'Cliente / servicio',20,y+8);
  doc.setFontSize(10.5);
  doc.setTextColor(15,23,42);
  doc.setFont(undefined,'normal');
  doc.text(String(p.clienteNombre || '—'), 20, y + 15, { maxWidth: 86 });
  let detailY=y+22;
  if(addressLines.length){
    doc.setFontSize(6.8);
    doc.setFont(undefined,'bold');
    doc.setTextColor(PDF_BRAND.muted[0],PDF_BRAND.muted[1],PDF_BRAND.muted[2]);
    doc.text('DIRECCIÓN',20,detailY);
    detailY+=4;
    doc.setFontSize(8.2);
    doc.setFont(undefined,'normal');
    doc.setTextColor(PDF_BRAND.text[0],PDF_BRAND.text[1],PDF_BRAND.text[2]);
    doc.text(addressLines,20,detailY);
    detailY+=addressLines.length*4+2;
  }
  if(locationLines.length){
    doc.setFontSize(6.8);
    doc.setFont(undefined,'bold');
    doc.setTextColor(PDF_BRAND.muted[0],PDF_BRAND.muted[1],PDF_BRAND.muted[2]);
    doc.text('UBICACIÓN',20,detailY);
    detailY+=4;
    doc.setFontSize(8.2);
    doc.setFont(undefined,'normal');
    doc.setTextColor(PDF_BRAND.text[0],PDF_BRAND.text[1],PDF_BRAND.text[2]);
    doc.text(locationLines,20,detailY);
  }
  pdfField(doc,'Fecha',fechaTxt,124,y+13,64);
  pdfBox(doc,122,y+21,70,18,PDF_BRAND.success,PDF_BRAND.panelBorder);
  doc.setFontSize(6.5);
  doc.setFont(undefined,'bold');
  doc.setTextColor(PDF_BRAND.muted[0],PDF_BRAND.muted[1],PDF_BRAND.muted[2]);
  doc.text('Nº DE PARTE',127,y+27);
  doc.setFontSize(10.5);
  doc.setTextColor(PDF_BRAND.accentDark[0],PDF_BRAND.accentDark[1],PDF_BRAND.accentDark[2]);
  doc.text(String(p.id||'—'),127,y+35,{maxWidth:60});
  y += summaryHeight + 6;

  // ── Servicio y técnico ──
  pdfBox(doc,14,y,182,55);
  pdfCardHeading(doc,'Servicio y técnico',20,y+8);
  pdfField(doc,'Técnico',p.empleadoNombre||'—',20,y+20,78);
  pdfField(doc,'Tipo de puerta',p.tipoPuerta||'—',108,y+20,80);
  pdfField(doc,'Puertas',puertasTexto,20,y+33,170);
  pdfField(doc,'Kilómetros',(p.kms||0)+' km',20,y+46,50);
  pdfField(doc,'Horas',(p.horas||0)+' h',80,y+46,50);
  pdfField(doc,'Fotos',String(p.fotos?.length||p.fotoscount||0),140,y+46,50);
  // Puertas intervenidas (marcadas con el check en el parte): destacadas en verde, con su observación
  if(Array.isArray(p.puertaIds) && p.puertaIds.length){
    const det = p.puertasDetalle || p.puertasdetalle || {};
    const puertas = await dbGetAll('puertas').catch(() => []);
    const mapP = Object.fromEntries(puertas.map(x => [x.id, x.nombre]));
    const lineasPuertas = p.puertaIds.map(id => {
      const nom = mapP[id] || id;
      const obs = det[id] || '';
      return obs ? ('✔ ' + nom + ': ' + obs) : ('✔ ' + nom);
    });
    doc.setFontSize(7.5); doc.setFont(undefined,'bold');
    doc.setTextColor(PDF_BRAND.accentDark[0],PDF_BRAND.accentDark[1],PDF_BRAND.accentDark[2]);
    doc.text(doc.splitTextToSize(lineasPuertas.join('\n'),78),108,y+33);
    doc.setFont(undefined,'normal');
  }
  y += 63;

  // ── Trabajo realizado ──
  const descriptionLines=doc.splitTextToSize(p.descripcion||'—',170);
  // Notas del parte: desactivadas a petición (el dato sigue en BD, no se imprime)
  const notesLines=[];
  const descriptionHeight=descriptionLines.length*4.5;
  const notesHeight=notesLines.length?8+notesLines.length*4.5:0;
  const workHeight=27+descriptionHeight+notesHeight;
  pdfBox(doc,14,y,182,workHeight);
  pdfCardHeading(doc,'Trabajo realizado',20,y+8);
  let textY=y+19;
  doc.setFontSize(7);
  doc.setFont(undefined,'bold');
  doc.setTextColor(PDF_BRAND.muted[0],PDF_BRAND.muted[1],PDF_BRAND.muted[2]);
  doc.text('DESCRIPCIÓN',20,textY);
  textY+=5;
  doc.setFontSize(9);
  doc.setFont(undefined,'normal');
  doc.setTextColor(PDF_BRAND.text[0],PDF_BRAND.text[1],PDF_BRAND.text[2]);
  doc.text(descriptionLines,20,textY);
  textY+=descriptionHeight+3;
  if(notesLines.length){
    doc.setDrawColor(PDF_BRAND.cardBorder[0],PDF_BRAND.cardBorder[1],PDF_BRAND.cardBorder[2]);
    doc.line(20,textY,190,textY);
    textY+=5;
    doc.setFontSize(7);
    doc.setFont(undefined,'bold');
    doc.setTextColor(PDF_BRAND.muted[0],PDF_BRAND.muted[1],PDF_BRAND.muted[2]);
    doc.text('NOTAS',20,textY);
    textY+=5;
    doc.setFontSize(9);
    doc.setFont(undefined,'normal');
    doc.setTextColor(PDF_BRAND.text[0],PDF_BRAND.text[1],PDF_BRAND.text[2]);
    doc.text(notesLines,20,textY);
  }
  y+=workHeight+8;

  // ── Material utilizado ──
  const materialesPdf=(Array.isArray(p.materiales)?p.materiales:[]).filter(m=>m&&String(m.descripcion||'').trim());
  if(materialesPdf.length){
    if(y+34>270){doc.addPage();y=24;}
    y=pdfSectionTitle(doc,'Material utilizado',y);
    doc.autoTable(pdfTableStyle({
      startY:y,
      margin:{left:14,right:14,top:24,bottom:18},
      head:[['#','Material','Cantidad','Unidad']],
      body:materialesPdf.map((m,i)=>[i+1,String(m.descripcion),String(Number(m.cantidad)||0).replace('.',','),String(m.unidad||'ud')]),
      columnStyles:{0:{cellWidth:10,halign:'center'},2:{cellWidth:28,halign:'right'},3:{cellWidth:24,halign:'center'}}
    }));
    y=(doc.lastAutoTable?.finalY||y)+8;
  }
  // ── Fotografías del parte: enlaces a las fotos (no se incrustan en el PDF) ──
  const partPhotos=(Array.isArray(p.fotos)?p.fotos:[]).filter(f=>typeof f==='string'&&f);
  if(partPhotos.length){
    const urls=[];
    let migrated=false;
    for(const photo of partPhotos){
      if(photo.startsWith('data:image/')){
        const url=await window.uploadParteFoto(photo);
        if(url){urls.push(url);migrated=true;}
        else urls.push(null);
      }else urls.push(photo);
    }
    // Las fotos antiguas en base64 quedan guardadas como URL para no volver a subirlas
    if(migrated){
      try{await dbPut('partesTrabajo',{...p,fotos:urls.map((u,i)=>u||partPhotos[i])});}
      catch(error){console.warn('No se pudieron guardar las URLs de las fotos:',error);}
    }
    if(y+24>270){doc.addPage();y=24;}
    y=pdfSectionTitle(doc,'Fotografías',y);
    urls.forEach((url,index)=>{
      if(y+9>270){doc.addPage();y=24;}
      doc.setFont(undefined,'normal');
      doc.setFontSize(9);
      if(url){
        doc.setTextColor(37,99,235);
        doc.textWithLink('Foto '+(index+1)+' — abrir foto',20,y+4,{url});
      }else{
        doc.setTextColor(PDF_BRAND.muted[0],PDF_BRAND.muted[1],PDF_BRAND.muted[2]);
        doc.text('Foto '+(index+1)+' — no disponible (sin conexión al generar el PDF)',20,y+4);
      }
      y+=7;
    });
    doc.setTextColor(PDF_BRAND.text[0],PDF_BRAND.text[1],PDF_BRAND.text[2]);
    y+=4;
  }

  // ═══════════ BLOQUE DE FIRMAS (ROBUSTO - SIN SOLAPAMIENTOS) ═══════════
  const signatureSpace=48;
  if(y+signatureSpace>270){doc.addPage();y=24;}
  else{y+=6;}

  // ── 1. DATOS DEL TÉCNICO (Desde BD de empleados) ──
  let emp = null;
  let nombreTecnico = '—';
  let dniTecnico = '—';
  let firmaTecnico = null;

  const claveNombre = Object.keys(p).find(k => 
    k.toLowerCase().includes('nombre') && k.toLowerCase().includes('emple')
  ) || Object.keys(p).find(k => k.toLowerCase().includes('tecnico'))
  || Object.keys(p).find(k => k.toLowerCase().includes('empleado'));

  if(claveNombre && p[claveNombre]){
    nombreTecnico = p[claveNombre];
    try {
      const listaEmp = await dbGetAll('empleados');
      emp = listaEmp.find(e => e.nombre === nombreTecnico) || null;
      if(emp){
        dniTecnico = emp.dni || '—';
        firmaTecnico = emp.firma || null;
      }
    } catch(e) { console.warn('Error leyendo empleados:', e); }
  }

  // ── 2. DATOS DEL CLIENTE (Directamente desde el parte) ──
  const claveFirmaCliente = Object.keys(p).find(k => k.toLowerCase().includes('firma') && k.toLowerCase().includes('cliente')) || null;
  const claveDniCliente = Object.keys(p).find(k => k.toLowerCase().includes('dni') && k.toLowerCase().includes('cliente')) || null;

  const firmaCliente = claveFirmaCliente ? p[claveFirmaCliente] : null;
  const dniCliente = claveDniCliente ? String(p[claveDniCliente]) : '—';

  // ── 3. DIBUJAR EN EL PDF ──
  const boxW = 85, boxH = 32;
  const xIzq = 14, xDer = 196 - boxW;
  const yFirma = y;
  const yDNI = yFirma + boxH + 4;

  // Sello del cliente: fotografiado en el momento del parte (guardado en el propio parte)
  const selloCliente = p.selloCliente || null;

  // ═══ IZQUIERDA: FIRMA CLIENTE + DNI CLIENTE ═══
  pdfBox(doc, xIzq, yFirma, boxW, boxH, PDF_BRAND.card, PDF_BRAND.cardBorder, PDF_BRAND.shadowStrong);
  doc.setFontSize(8); doc.setTextColor(100,116,139);
  doc.text('FIRMA DEL CLIENTE', xIzq + boxW/2, yFirma + 5, {align:'center'});

  if(firmaCliente){
    pdfAddImageContain(doc, firmaCliente, xIzq + 5, yFirma + 8, boxW - 10, boxH - 12);
  }
  if(selloCliente){
    // Sello del día impreso sobre la firma (esquina superior derecha, superpuesto)
    try{ pdfAddImageContain(doc, selloCliente, xIzq + boxW - 28, yFirma + 6, 24, 24); }catch(_){ }
  }

  doc.setFontSize(7); doc.setTextColor(100,116,139);
  doc.text('DNI/NIF DEL CLIENTE', xIzq, yDNI);
  doc.setDrawColor(150,150,150); doc.setLineWidth(0.4);
  doc.rect(xIzq, yDNI + 2, boxW, 8);
  doc.setFontSize(9.5); doc.setTextColor(15,23,42);
  doc.text(dniCliente, xIzq + boxW/2, yDNI + 7.5, {align:'center'});

  // ═══ DERECHA: FIRMA TÉCNICO + DNI TÉCNICO ═══
  pdfBox(doc, xDer, yFirma, boxW, boxH, PDF_BRAND.card, PDF_BRAND.cardBorder, PDF_BRAND.shadowStrong);
  doc.setFontSize(8); doc.setTextColor(100,116,139);
  doc.text('FIRMA DEL TÉCNICO', xDer + boxW/2, yFirma + 5, {align:'center'});

  if(firmaTecnico){
    pdfAddImageContain(doc, firmaTecnico, xDer + 5, yFirma + 8, boxW - 10, boxH - 12);
  }

  doc.setFontSize(7.5); doc.setTextColor(15,23,42);
  doc.text(nombreTecnico, xDer + boxW/2, yFirma + boxH - 3, {align:'center'});

  doc.setFontSize(7); doc.setTextColor(100,116,139);
  doc.text('DNI/NIF DEL TÉCNICO', xDer, yDNI);
  doc.setDrawColor(150,150,150); doc.setLineWidth(0.4);
  doc.rect(xDer, yDNI + 2, boxW, 8);
  doc.setFontSize(9.5); doc.setTextColor(15,23,42);
  doc.text(dniTecnico, xDer + boxW/2, yDNI + 7.5, {align:'center'});

  y = yDNI + 8 + 8;

  addPDFFootersAllPages(doc);
  const partIdForFile=String(p.id||'sin-id').replace(/[^a-zA-Z0-9_-]/g,'_');
  const dateForFile=String(p.fecha||'').replace(/\D/g,'')||'sin-fecha';
  doc.save('Parte_'+partIdForFile+'_'+dateForFile+'.pdf');
};

// ── PDF formato DOTICS: formulario físico "INFORME VISITA DE MANTENIMIENTO" ──
// A4 horizontal, cabecera con campos, tabla de equipos y pie de firmas.
// Opción de fotos: se incluyen como enlaces clicable (no descuadran el PDF);
// si la foto ya es un dataURL pequeño también se puede embeber miniatura.
window.generatePDF_dotics=async function(revision,metadata,{download=true}={}){
  await window.ensurePdfLibs();
  jsPDF=window.jspdf.jsPDF;
  const items=revision.items||[];
  // A4 apaisado
  const doc=new jsPDF({orientation:'landscape',unit:'mm',format:'a4'});
  const W=297,H=210,M=12;               // márgenes
  const contentW=W-M*2;

  const logo=await getCompanyLogoDataUrl();
  // Cabecera: logo + título del formulario
  let y=M;
  if(logo){
    try{
      const props=doc.getImageProperties(logo);
      const h=16,ratio=props.width/props.height;
      doc.setFillColor(255,255,255);doc.setDrawColor(203,213,225);doc.setLineWidth(.4);
      doc.roundedRect(M,y,16*ratio>24?24:16*ratio,h,2,2,'FD');
      doc.addImage(logo,'PNG',M+2,y+2,Math.min(24,16*ratio)-4,h-4,undefined,'FAST');
    }catch(e){}
  }
  doc.setFontSize(15);doc.setFont(undefined,'bold');doc.setTextColor(15,23,42);
  doc.text('INFORME VISITA DE MANTENIMIENTO',W/2,y+9,{align:'center'});
  doc.setFontSize(9);doc.setFont(undefined,'normal');doc.setTextColor(100,116,139);
  doc.text(String(metadata.cliente||metadata.cadena||'DOTICS').toUpperCase(),W/2,y+15,{align:'center'});
  doc.setFontSize(8);doc.setTextColor(100,116,139);
  doc.text('Nº Revisión: '+String(revision.id||'—'),W-M,y+9,{align:'right'});
  y+=20;

  // Bloque de datos: Cliente / Nº contrato / Nº intervención / Técnico/s / Fecha
  const fields=[
    ['Cliente',metadata.cliente||metadata.cadena||'—'],
    ['N.º contrato mantenimiento',metadata.contrato||'—'],
    ['N.º intervención',metadata.intervencion||'—'],
    ['Técnico/s',metadata.tecnicos||revision.tecnicoNombre||'—'],
    ['Fecha',formatDate(revision.fecha)]
  ];
  const fw=contentW/fields.length;
  const fh=17;
  pdfBox(doc,M,y,contentW,fh,PDF_BRAND.panel,PDF_BRAND.panelBorder);
  fields.forEach(([label,value],i)=>{
    doc.setFontSize(6.5);doc.setFont(undefined,'normal');doc.setTextColor(100,116,139);
    doc.text(String(label).toUpperCase(),M+i*fw+3,y+5);
    doc.setFontSize(9);doc.setFont(undefined,'bold');doc.setTextColor(15,23,42);
    // Valor completo en varias líneas (los nombres de varios técnicos no se cortan)
    const lines=doc.splitTextToSize(String(value||'—'),fw-6).slice(0,2);
    doc.text(lines,M+i*fw+3,y+10.5);
  });
  y+=fh+6;

  // Tabla de equipos (la columna Fotos lleva miniaturas pequeñas dentro de la fila:
  // siempre visibles, sin depender de enlaces que muchos visores no abren)
  const head=[['Tipo producto','Denom. cliente','Nº de serie','Estado del equipo','Observaciones','Fotos']];
  const body=items.map(item=>[
    item.tipoProducto||item.tipoPuerta||item.tipo||'—',
    item.denominacionCliente||item.concepto||'—',
    item.numeroSerie||'—',
    item.estadoEquipo==='bueno'?'Bueno':item.estadoEquipo==='operativo'?'Operativo':item.estadoEquipo==='no_usar'?'No usar':(item.estadoEquipo||item.estado||'—'),
    item.observaciones||item.hallazgo||'',
    (item.fotos||[]).length?String(item.fotos.length)+' foto'+(item.fotos.length>1?'s':''):'—'
  ]);
  if(!body.length) body.push(['—','—','—','—','—','—']);
  const fotosPorFila=items.map(item=>item.fotos||[]);
  doc.autoTable(pdfTableStyle({
    startY:y,margin:{left:M,right:M,bottom:34},
    head,body,
    columnStyles:{0:{cellWidth:38},1:{cellWidth:62},2:{cellWidth:36},3:{cellWidth:28,halign:'center'},5:{cellWidth:26,halign:'center'}},
    styles:{fontSize:8,cellPadding:2.2,valign:'middle'},
    headStyles:{fillColor:PDF_BRAND.primary,textColor:255,fontSize:8,fontStyle:'bold',cellPadding:2.5},
    bodyStyles:{fontSize:8,cellPadding:2.2,textColor:PDF_BRAND.text,overflow:'linebreak'},
    didDrawCell:data=>{
      // Miniaturas embebidas en la celda de fotos (hasta 3, ~9 mm cada una)
      if(data.section==='body'&&data.column.index===5){
        const fotos=fotosPorFila[data.row.index]||[];
        if(!fotos.length) return;
        const cell=data.cell;
        const size=8.5;
        let fx=cell.x+2;
        const fy=cell.y+(cell.height-size)/2;
        for(let i=0;i<Math.min(3,fotos.length);i++){
          try{
            doc.addImage(fotos[i],'JPEG',fx,fy,size,size,undefined,'FAST');
            doc.setDrawColor(203,213,225);doc.setLineWidth(0.2);doc.rect(fx,fy,size,size);
          }catch(e){}
          fx+=size+1.5;
        }
        if(fotos.length>3){
          doc.setFontSize(6);doc.setTextColor(100,116,139);
          doc.text('+'+(fotos.length-3),fx,fy+size-1);
        }
      }
    },
    willDrawCell:data=>{
      // La columna de fotos reserva su alto según el número de miniaturas
      if(data.section==='body'&&data.column.index===5){
        const fotos=fotosPorFila[data.row.index]||[];
        if(fotos.length) data.cell.styles.minCellHeight=Math.max(data.cell.styles.minCellHeight||0,11);
      }
    }
  }));
  y=(doc.lastAutoTable?.finalY||y)+8;

  // Observaciones generales
  if(metadata.observaciones){
    const lines=doc.splitTextToSize(metadata.observaciones,contentW-12);
    const h=Math.max(12,lines.length*4.6+9);
    if(y+h>H-58){doc.addPage('a4','landscape');y=M;}
    pdfBox(doc,M,y,contentW,h,PDF_BRAND.warn,PDF_BRAND.warnBorder);
    doc.setFontSize(7);doc.setFont(undefined,'bold');doc.setTextColor(120,53,15);
    doc.text('OBSERVACIONES GENERALES',M+5,y+5);
    doc.setFontSize(8.5);doc.setFont(undefined,'normal');doc.setTextColor(15,23,42);
    doc.text(lines,M+5,y+10);
    y+=h+6;
  }

  // (Las fotos van embebidas en la columna «Fotos» de la tabla, dentro de cada fila)

  // Pie: VºBº cliente + firma técnico + sello
  const yPie=H-32;
  const bw=(contentW-12)/3;
  [[M,'VºBº CLIENTE'],[M+bw+6,'FIRMA TÉCNICO'],[M+(bw+6)*2,'SELLO']]
    .forEach(([x,label])=>{
      doc.setDrawColor(148,163,184);doc.setLineWidth(.35);
      doc.rect(x,yPie,bw,22);
      doc.setFontSize(7);doc.setFont(undefined,'normal');doc.setTextColor(100,116,139);
      doc.text(label,x+3,yPie+5);
    });
  // Firma del técnico si la revisión la guarda
  try{
    const firma=metadata.firma||metadata.firmaTecnico||revision.firma;
    if(firma&&String(firma).startsWith('data:image')){
      pdfAddImageContain(doc,firma,M+bw+8,yPie+6,bw-4,14);
    }
  }catch(e){}

  addPDFFootersAllPages(doc);
  const filename='revision_dotics_'+String(revision.id||'').replace(/[^a-zA-Z0-9_-]/g,'_')+'.pdf';
  const blob=doc.output('blob');
  if(download){doc.save(filename);showToast('PDF Dotics descargado');}
  return {blob,filename};
};

window.generatePDF_revision=async function(revisionId,{download=true}={}){
  const revision=await dbGet('revisiones',revisionId);
  if(!revision){showToast('No se encontró la revisión','error');return;}
  let metadata={};
  try{metadata=JSON.parse(revision.notas||'{}');}catch(error){metadata={observaciones:revision.notas||''};}
  // Las revisiones DOTICS salen en el formato del formulario físico
  // "INFORME VISITA DE MANTENIMIENTO" (modelo Assa Abloy en horizontal).
  if(metadata.form==='DOTICS_VISITA_V1'||String(metadata.cadena||metadata.cliente||'').trim().toLocaleUpperCase()==='DOTICS'){
    return generatePDF_dotics(revision,metadata,{download});
  }
  const items=revision.items||[];
  const doc=await createBrandedPDF('Informe de Revisión','Revisión de equipos');
  const chain=metadata.cadena||metadata.cliente||'—';
  const stores=(metadata.supermercados||[]).map(store=>store.nombre).filter(Boolean).join(', ');
  let y=pdfSectionTitle(doc,'Resumen de revisión',38);
  pdfBox(doc,14,y,182,30,PDF_BRAND.panel,PDF_BRAND.panelBorder);
  pdfField(doc,'Fecha',formatDate(revision.fecha),20,y+10,78);
  pdfField(doc,'Cadena',chain,110,y+10,78);
  pdfField(doc,'Cliente / supermercado',stores||metadata.cliente||'—',20,y+23,82);
  pdfField(doc,'Técnico',metadata.tecnicos||revision.tecnicoNombre||revision.tecnicoId||'—',110,y+23,78);
  y+=38;
  let tableRows=items.map(item=>[
    item.concepto||item.denominacionCliente||'Equipo',
    item.tipoPuerta||item.tipoProducto||item.tipo||'—',
    item.hallazgo||item.hallazgoTexto||item.hallazgoEstado||item.estadoEquipo||'—',
    item.correctivo||item.correctivoTexto||'—',
    item.resultado||item.estadoEquipo||'—'
  ]);
  if(!tableRows.length)tableRows=[['Sin equipos registrados','—','—','—','—']];
  y=pdfSectionTitle(doc,'Equipos revisados',y);
  doc.autoTable(pdfTableStyle({startY:y,head:[['Equipo / ubicación','Tipo','Hallazgo / estado','Correctivo / observaciones','Resultado']],body:tableRows,headStyles:{fillColor:PDF_BRAND.primary,textColor:255,fontSize:7.5,fontStyle:'bold',cellPadding:3},bodyStyles:{fontSize:7.5,cellPadding:2.5,textColor:PDF_BRAND.text,overflow:'linebreak'}}));
  y=(doc.lastAutoTable?.finalY||90)+8;
  const notes=[metadata.intervencion?'Intervención: '+metadata.intervencion:'',metadata.contrato?'Contrato: '+metadata.contrato:'',metadata.observaciones||''].filter(Boolean).join('\n');
  if(notes){
    const lines=doc.splitTextToSize(notes,170);
    if(y+lines.length*4.8+34>276){doc.addPage();y=24;}
    y=pdfTitledTextCard(doc,'Observaciones',notes,14,y,182,PDF_BRAND.warn,PDF_BRAND.warnBorder,PDF_BRAND.warnText)+8;
  }
  const photos=[];
  items.forEach(item=>{
    [...(item.hallazgoFotos||[]),...(item.fotos||[])].forEach((photo,index)=>photos.push({label:(item.concepto||'Equipo')+' · Foto '+(index+1),url:photo}));
  });
  if(photos.length){
    if(y+20>276){doc.addPage();y=24;}
    y=pdfSectionTitle(doc,'Fotografías',y);
    for(const photo of photos){
      let imageData=photo.url;
      if(typeof imageData!=='string')continue;
      if(!imageData.startsWith('data:image/'))imageData=await urlToCompressedJPEG(imageData);
      if(!imageData)continue;
      // Medir primero TODO el contenido (texto + imagen) para reservar el alto exacto
      // y que la tarjeta nunca solape el texto que hay debajo.
      let cardH=0;
      try{
        const dimensions=doc.getImageProperties(imageData);
        const scale=Math.min(80/dimensions.width,48/dimensions.height);
        const imgW=dimensions.width*scale;
        const imgH=dimensions.height*scale;
        doc.setFontSize(7.5);doc.setFont(undefined,'bold');doc.setTextColor(PDF_BRAND.accentDark[0],PDF_BRAND.accentDark[1],PDF_BRAND.accentDark[2]);
        const textLines=doc.splitTextToSize(photo.label,80);
        const textH=textLines.length*4.5;
        cardH=8+textH+2+imgH+8; // margen sup. + texto + separación + imagen + margen inf.
        if(y+cardH>276){doc.addPage();y=24;}
        pdfBox(doc,14,y,182,cardH,PDF_BRAND.white,PDF_BRAND.cardBorder,PDF_BRAND.shadowStrong);
        doc.text(textLines,20,y+7);
        doc.addImage(imageData,'JPEG',20,y+9+textH,imgW,imgH,undefined,'FAST');
        y+=cardH+6;
      }catch(error){console.warn('No se pudo incluir una foto en el PDF:',error);}
    }
  }
  addPDFFootersAllPages(doc);
  const filename='revision_'+String(revision.id).replace(/[^a-zA-Z0-9_-]/g,'_')+'.pdf';
  const blob=doc.output('blob');
  if(download){
    doc.save(filename);
    showToast('PDF de revisión descargado');
  }
  return {blob,filename};
};

window.generatePDF_almacen = async function(){
  const items = await dbGetAll('almacen');
  if(!items.length){showToast('No hay artículos en el almacén','error');return}
  const doc = await createBrandedPDF('Inventario de Almacén','Control de stock');
  const tableStart=pdfSectionTitle(doc,'Existencias',38);
  doc.autoTable(pdfTableStyle({startY:tableStart,head:[['Ref.','Nombre','Categoría','Unidad','Stock','Mín.','P. Compra','P. Venta','Proveedor']],
  body:items.map(a=>[a.referencia,a.nombre,a.categoria||'—',a.unidad||'unidad',a.stock,a.stockMinimo,formatCurrency(a.precioCompra),formatCurrency(a.precioVenta),a.proveedor||'—']),
  headStyles:{fillColor:PDF_BRAND.primary,textColor:255,fontSize:7.5,fontStyle:'bold',cellPadding:3},bodyStyles:{fontSize:7.5,cellPadding:2.5,textColor:PDF_BRAND.text},columnStyles:{0:{cellWidth:22},1:{cellWidth:45},4:{halign:'center'},5:{halign:'center'},6:{halign:'right'},7:{halign:'right'}}}));
  addPDFFootersAllPages(doc); doc.save('almacen_'+getToday()+'.pdf'); showToast('PDF de almacén generado');
};

window.generatePDF_presupuestos = async function(){
  const presupuestos = await dbGetAll('presupuestos');
  if(!presupuestos.length){showToast('No hay presupuestos','error');return}
  const doc = await createBrandedPDF('Listado de Presupuestos','Resumen comercial');
  const tableStart=pdfSectionTitle(doc,'Relación de presupuestos',38);
  doc.autoTable(pdfTableStyle({startY:tableStart,head:[['ID','Cliente','Fecha','Válido hasta','Total','Estado']],
  body:presupuestos.map(p=>[p.id,p.clienteNombre,formatDate(p.fecha),formatDate(p.validoHasta),formatCurrency(p.total),getStatusLabel(p.estado)]),
  columnStyles:{4:{halign:'right'}}}));
  addPDFFootersAllPages(doc); doc.save('presupuestos_'+getToday()+'.pdf'); showToast('PDF de presupuestos generado');
};

window.generatePDF_ruta=async function(revisions,{rutaNombre='',cadenaNombre=''}={}){
  const parseNotes=revision=>{try{return JSON.parse(revision.notas||'{}');}catch(error){return {observaciones:revision.notas||''};}};
  const stores=new Map();
  let totalEquipos=0,totalFallos=0;
  const dates=[];
  for(const revision of revisions){
    const notes=parseNotes(revision);
    if(revision.fecha) dates.push(String(revision.fecha).slice(0,10));
    const touched=new Set();
    for(const item of revision.items||[]){
      const storeName=item.clienteNombre||(String(item.concepto||'').split(' · ')[0])||'Tienda';
      touched.add(storeName);
      if(!stores.has(storeName)) stores.set(storeName,{rows:[],notes:[]});
      const store=stores.get(storeName);
      const failed=String(item.resultado||'').toUpperCase()==='X';
      totalEquipos++;
      if(failed) totalFallos++;
      store.rows.push([
        String(item.concepto||'Equipo').split(' · ').slice(1).join(' · ')||item.concepto||'Equipo',
        item.tipoPuerta||item.tipo||'—',
        item.hallazgoTexto||item.hallazgo||'—',
        item.correctivoTexto||item.correctivo||'—',
        item.resultado||'—',
        formatDate(revision.fecha)
      ]);
    }
    if(notes.observaciones) for(const name of touched){
      const store=stores.get(name);
      if(!store.notes.includes(notes.observaciones)) store.notes.push(notes.observaciones);
    }
  }
  const doc=await createBrandedPDF('Informe de Ruta','Revisión de ruta');
  dates.sort();
  const period=dates.length?(dates[0]===dates[dates.length-1]?formatDate(dates[0]):formatDate(dates[0])+' – '+formatDate(dates[dates.length-1])):'—';
  let y=pdfSectionTitle(doc,'Resumen de ruta',38);
  pdfBox(doc,14,y,182,30,PDF_BRAND.panel,PDF_BRAND.panelBorder);
  pdfField(doc,'Ruta',rutaNombre||'—',20,y+10,78);
  pdfField(doc,'Cadena',cadenaNombre||'—',110,y+10,78);
  pdfField(doc,'Tiendas revisadas',String(stores.size),20,y+23,40);
  pdfField(doc,'Equipos · incidencias',totalEquipos+' · '+totalFallos,70,y+23,38);
  pdfField(doc,'Periodo',period,110,y+23,78);
  y+=38;
  for(const [storeName,store] of stores){
    if(y>235){doc.addPage();y=24;}
    y=pdfSectionTitle(doc,storeName,y);
    doc.autoTable(pdfTableStyle({startY:y,margin:{left:14,right:14,top:24,bottom:18},head:[['Equipo','Tipo','Hallazgo','Correctivo','Resultado','Fecha']],body:store.rows,headStyles:{fillColor:PDF_BRAND.primary,textColor:255,fontSize:7.5,fontStyle:'bold',cellPadding:3},bodyStyles:{fontSize:7.5,cellPadding:2.5,textColor:PDF_BRAND.text,overflow:'linebreak'},columnStyles:{4:{halign:'center',cellWidth:20},5:{cellWidth:22}}}));
    y=(doc.lastAutoTable?.finalY||y)+8;
    if(store.notes.length){
      if(y>230){doc.addPage();y=24;}
      y=pdfTitledTextCard(doc,'Observaciones',store.notes.join('\n'),14,y,182,PDF_BRAND.warn,PDF_BRAND.warnBorder,PDF_BRAND.warnText)+8;
    }
  }
  addPDFFootersAllPages(doc);
  doc.save('ruta_'+String(rutaNombre||'sin-nombre').replace(/[^a-zA-Z0-9_-]/g,'_')+'_'+getToday()+'.pdf');
  showToast('PDF de la ruta generado');
};

// jsPDF y autotable se cargan bajo demanda la primera vez que se genera un PDF
['generatePDF_clientes','generatePDF_presupuesto','generatePDF_partes','generatePDF_revision',
 'generatePDF_almacen','generatePDF_presupuestos','generatePDF_ruta'].forEach(name => {
  const original = window[name];
  window[name] = async function(...args){
    try{
      await window.ensurePdfLibs();
    }catch(error){
      showToast(error.message,'error');
      throw error;
    }
    jsPDF = window.jspdf.jsPDF;
    return original.apply(this,args);
  };
});