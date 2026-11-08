/* =========================================================
 * plantillas-medidas.js v2.0
 * Plantillas de medidas con FOTOS PROPIAS de la empresa.
 * - El técnico SUBE la foto/plantilla que ya tiene hecha
 *   (cámara o archivo), la anota con lápiz/goma/deshacer
 *   y la guarda con cliente, fecha, tipo (Presupuesto o
 *   Pedido directo) y referencia, para pasarla a administración.
 * - Se adjunta al presupuesto al guardarlo.
 * ========================================================= */
'use strict';

window.PLANTILLAS_MEDIDAS = (function(){
  const STORAGE_KEY='autopuerta_plantillas_medidas';
  const _esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

  // ── Almacenamiento local de plantillas guardadas ──
  function listar(){ try{ return JSON.parse(localStorage.getItem(STORAGE_KEY)||'[]'); }catch(e){ return []; } }
  function guardarEnLista(p){
    const lista=listar().filter(x=>x.id!==p.id);
    lista.unshift(p);
    localStorage.setItem(STORAGE_KEY,JSON.stringify(lista.slice(0,50)));
  }

  const PLANTILLAS = {
    seccional: {
      nombre: 'Puerta Seccional',
      campos: [
        { id: 'ancho',     etiqueta: 'Ancho hueco (mm)',  defecto: 2500, min: 500, max: 12000 },
        { id: 'alto',      etiqueta: 'Alto hueco (mm)',   defecto: 2200, min: 500, max: 12000 },
        { id: 'luzLibre',  etiqueta: 'Luz libre (mm)',    defecto: 2100, min: 400, max: 11000 },
        { id: 'hierroGuia',etiqueta: 'Hierro guía (mm)',  defecto: 100,  min: 50,  max: 400 }
      ],
      svg: (v)=>`
        <svg viewBox="0 0 300 220" xmlns="http://www.w3.org/2000/svg">
          <!-- Hueco -->
          <rect x="40" y="30" width="220" height="160" fill="none" stroke="#1e3a5f" stroke-width="3"/>
          <!-- Panel seccional -->
          <rect x="48" y="38" width="204" height="144" fill="#e8f0fa" stroke="#4a6fa5" stroke-width="2"/>
          <!-- Líneas horizontales paneles -->
          ${[0,1,2,3].map(i=>`<line x1="48" y1="${38+36*(i+1)}" x2="252" y2="${38+36*(i+1)}" stroke="#4a6fa5" stroke-width="1.2"/>`).join('')}
          <!-- Guías laterales -->
          <rect x="30" y="30" width="10" height="160" fill="#cbd5e1" stroke="#1e3a5f"/>
          <rect x="260" y="30" width="10" height="160" fill="#cbd5e1" stroke="#1e3a5f"/>
          <!-- Motor -->
          <circle cx="150" cy="22" r="9" fill="#1e3a5f"/>
          <!-- Flecha alto -->
          <line x1="285" y1="30" x2="285" y2="190" stroke="#e11d48" stroke-width="1.8"/>
          <polygon points="285,30 281,38 289,38" fill="#e11d48"/>
          <polygon points="285,190 281,182 289,182" fill="#e11d48"/>
          <text x="292" y="112" font-size="11" fill="#e11d48" font-weight="bold" transform="rotate(90 292 112)">ALTO ${v.alto}</text>
          <!-- Flecha ancho -->
          <line x1="40" y1="205" x2="260" y2="205" stroke="#e11d48" stroke-width="1.8"/>
          <polygon points="40,205 48,201 48,209" fill="#e11d48"/>
          <polygon points="260,205 252,201 252,209" fill="#e11d48"/>
          <text x="150" y="216" font-size="11" fill="#e11d48" font-weight="bold" text-anchor="middle">ANCHO ${v.ancho}</text>
          <!-- Luz libre -->
          <line x1="48" y1="196" x2="252" y2="196" stroke="#0d9488" stroke-width="1.5" stroke-dasharray="5,3"/>
          <text x="150" y="192" font-size="9" fill="#0d9488" text-anchor="middle">LUZ ${v.luzLibre}</text>
          <!-- Guía -->
          <text x="35" y="25" font-size="8" fill="#475569" text-anchor="middle">${v.hierroGuia}</text>
          <text x="265" y="25" font-size="8" fill="#475569" text-anchor="middle">${v.hierroGuia}</text>
        </svg>`
    },
    rapida: {
      nombre: 'Puerta Rápida',
      campos: [
        { id: 'ancho',    etiqueta: 'Ancho hueco (mm)',  defecto: 3000, min: 1000, max: 8000 },
        { id: 'alto',     etiqueta: 'Alto hueco (mm)',   defecto: 2500, min: 1000, max: 8000 },
        { id: 'embocadura',etiqueta: 'Embocadura (mm)',  defecto: 400,  min: 100,  max: 1000 },
        { id: 'celulas',  etiqueta: 'Nº células',        defecto: 2,    min: 0,    max: 6 }
      ],
      svg: (v)=>`
        <svg viewBox="0 0 300 220" xmlns="http://www.w3.org/2000/svg">
          <rect x="40" y="30" width="220" height="160" fill="none" stroke="#1e3a5f" stroke-width="3"/>
          <!-- Lona con ondas -->
          <path d="M 48 38 L 252 38 L 252 182 Q 200 175 150 182 Q 100 189 48 182 Z" fill="#fce7f3" stroke="#be185d" stroke-width="2"/>
          <path d="M 48 70 Q 100 63 150 70 Q 200 77 252 70" fill="none" stroke="#be185d" stroke-width="1.5" opacity="0.6"/>
          <path d="M 48 100 Q 100 93 150 100 Q 200 107 252 100" fill="none" stroke="#be185d" stroke-width="1.5" opacity="0.6"/>
          <path d="M 48 130 Q 100 123 150 130 Q 200 137 252 130" fill="none" stroke="#be185d" stroke-width="1.5" opacity="0.6"/>
          <!-- Ventanilla -->
          <rect x="130" y="110" width="40" height="30" rx="4" fill="#e0f2fe" stroke="#1e3a5f"/>
          <!-- Embocadura -->
          <rect x="20" y="30" width="20" height="160" fill="#f1f5f9" stroke="#1e3a5f" stroke-dasharray="4,2"/>
          <rect x="260" y="30" width="20" height="160" fill="#f1f5f9" stroke="#1e3a5f" stroke-dasharray="4,2"/>
          <!-- Células -->
          ${Array.from({length: v.celulas}, (_,i)=>`<circle cx="${60+i*30}" cy="150" r="4" fill="#f59e0b"/>`).join('')}
          <text x="150" y="216" font-size="11" fill="#e11d48" font-weight="bold" text-anchor="middle">ANCHO ${v.ancho} × ALTO ${v.alto}</text>
          <text x="30" y="25" font-size="8" fill="#475569" text-anchor="middle">EMBOC ${v.embocadura}</text>
          <text x="270" y="25" font-size="8" fill="#475569" text-anchor="middle">EMBOC ${v.embocadura}</text>
        </svg>`
    },
    corredera: {
      nombre: 'Puerta Corredera',
      campos: [
        { id: 'ancho',   etiqueta: 'Ancho hoja (mm)',   defecto: 2000, min: 600,  max: 6000 },
        { id: 'alto',    etiqueta: 'Alto hoja (mm)',    defecto: 2100, min: 600,  max: 6000 },
        { id: 'hueco',   etiqueta: 'Hueco total (mm)',  defecto: 2100, min: 700,  max: 7000 },
        { id: 'hojas',   etiqueta: 'Nº hojas',          defecto: 1,    min: 1,    max: 4 }
      ],
      svg: (v)=>`
        <svg viewBox="0 0 300 220" xmlns="http://www.w3.org/2000/svg">
          <rect x="40" y="30" width="220" height="160" fill="none" stroke="#1e3a5f" stroke-width="3"/>
          <!-- Hueco abierto -->
          <rect x="48" y="38" width="204" height="144" fill="#f8fafc" stroke="#cbd5e1" stroke-dasharray="3,3"/>
          <!-- Hoja corriendo -->
          <rect x="${48+v.hueco*0.15}" y="38" width="${Math.max(20, 204-v.hueco*0.15)}" height="144" fill="#dcfce7" stroke="#16a34a" stroke-width="2"/>
          <!-- Riel superior -->
          <rect x="40" y="24" width="220" height="6" fill="#1e3a5f"/>
          ${Array.from({length: v.hojas}, (_,i)=>`<circle cx="${70+i*60}" cy="27" r="3" fill="#f59e0b"/>`).join('')}
          <!-- Manilla -->
          <rect x="${48+v.hueco*0.15+8}" y="100" width="4" height="24" fill="#16a34a"/>
          <text x="150" y="216" font-size="11" fill="#e11d48" font-weight="bold" text-anchor="middle">HOJA ${v.ancho} × ${v.alto}</text>
          <text x="150" y="18" font-size="9" fill="#475569" text-anchor="middle">HUECO ${v.hueco}</text>
        </svg>`
    },
    basculante: {
      nombre: 'Puerta Basculante',
      campos: [
        { id: 'ancho',  etiqueta: 'Ancho hueco (mm)',  defecto: 2400, min: 800, max: 5000 },
        { id: 'alto',   etiqueta: 'Alto hueco (mm)',   defecto: 2100, min: 800, max: 4000 },
        { id: 'muelles',etiqueta: 'Nº muelles',        defecto: 2,    min: 1,   max: 6 }
      ],
      svg: (v)=>`
        <svg viewBox="0 0 300 220" xmlns="http://www.w3.org/2000/svg">
          <rect x="40" y="30" width="220" height="160" fill="none" stroke="#1e3a5f" stroke-width="3"/>
          <!-- Panel inclinado (abierta) -->
          <path d="M 48 38 L 252 38 L 220 90 L 80 90 Z" fill="#fef3c7" stroke="#d97706" stroke-width="2"/>
          <!-- Muelles -->
          ${Array.from({length: v.muelles}, (_,i)=>`<path d="M ${60+i*(160/Math.max(1,v.muelles-1))} 38 q 4 8 -2 16 q -4 8 2 16" stroke="#1e3a5f" stroke-width="2" fill="none"/>`).join('')}
          <text x="150" y="216" font-size="11" fill="#e11d48" font-weight="bold" text-anchor="middle">${v.ancho} × ${v.alto}</text>
          <text x="150" y="105" font-size="9" fill="#d97706" text-anchor="middle">PANEL</text>
        </svg>`
    },
    enrollable: {
      nombre: 'Persiana Enrollable',
      campos: [
        { id: 'ancho', etiqueta: 'Ancho hueco (mm)',  defecto: 3000, min: 800,  max: 8000 },
        { id: 'alto',  etiqueta: 'Alto hueco (mm)',   defecto: 2500, min: 800,  max: 6000 },
        { id: 'lamas', etiqueta: 'Tipo lama',         defecto: 1,    min: 1,    max: 3 }
      ],
      svg: (v)=>`
        <svg viewBox="0 0 300 220" xmlns="http://www.w3.org/2000/svg">
          <rect x="40" y="30" width="220" height="160" fill="none" stroke="#1e3a5f" stroke-width="3"/>
          <!-- Cajón -->
          <rect x="40" y="18" width="220" height="12" fill="#475569"/>
          <!-- Lamas enrolladas -->
          ${Array.from({length: 14}, (_,i)=>`<rect x="48" y="${36+i*5}" width="204" height="4" fill="${['#e2e8f0','#cbd5e1'][i%2]}" stroke="#94a3b8" stroke-width="0.5"/>`).join('')}
          ${Array.from({length: 6}, (_,i)=>`<rect x="48" y="${108+i*11}" width="204" height="10" fill="#f1f5f9" stroke="#94a3b8"/>`).join('')}
          <text x="150" y="216" font-size="11" fill="#e11d48" font-weight="bold" text-anchor="middle">${v.ancho} × ${v.alto}</text>
        </svg>`
    },
    automatizacion: {
      nombre: 'Motorización / Automatización',
      campos: [
        { id: 'anchoPuerta', etiqueta: 'Ancho puerta (mm)', defecto: 2500, min: 800, max: 12000 },
        { id: 'altoPuerta',  etiqueta: 'Alto puerta (mm)',  defecto: 2200, min: 800, max: 12000 },
        { id: 'tipoMotor',   etiqueta: 'Tipo (1=Tubo,2=Secc,3=Corredera)', defecto: 2, min: 1, max: 3 },
        { id: 'accesorios',  etiqueta: 'Nº accesorios',     defecto: 2, min: 0, max: 10 }
      ],
      svg: (v)=>`
        <svg viewBox="0 0 300 220" xmlns="http://www.w3.org/2000/svg">
          <rect x="40" y="30" width="220" height="160" fill="none" stroke="#1e3a5f" stroke-width="3"/>
          <rect x="48" y="38" width="204" height="144" fill="#e8f0fa" stroke="#4a6fa5" stroke-width="2"/>
          ${[0,1,2,3].map(i=>`<line x1="48" y1="${38+36*(i+1)}" x2="252" y2="${38+36*(i+1)}" stroke="#4a6fa5" stroke-width="1.2"/>`).join('')}
          <!-- Motor según tipo -->
          ${v.tipoMotor==='1'
            ? `<rect x="120" y="14" width="60" height="16" rx="8" fill="#1e3a5f"/><text x="150" y="25" font-size="7" fill="#fff" text-anchor="middle">TUBO</text>`
            : v.tipoMotor==='2'
            ? `<circle cx="150" cy="22" r="10" fill="#1e3a5f"/><text x="150" y="25" font-size="7" fill="#fff" text-anchor="middle">EJE</text>`
            : `<rect x="40" y="14" width="220" height="14" fill="#1e3a5f"/><text x="150" y="24" font-size="7" fill="#fff" text-anchor="middle">CORREDERA</text>`}
          <!-- Accesorios -->
          ${Array.from({length: Math.min(v.accesorios,6)}, (_,i)=>`<circle cx="${70+i*30}" cy="180" r="4" fill="#16a34a"/>`).join('')}
          <text x="150" y="216" font-size="11" fill="#e11d48" font-weight="bold" text-anchor="middle">${v.anchoPuerta} × ${v.altoPuerta}</text>
        </svg>`
    }
  };

  let estado = {
    modal: null,
    callbacks: null,
    dibujoActivo: false,
    historialDibujo: [],
    historialPos: -1,
    canvas: null,
    ctx: null,
    datosPlantilla: null
  };

  function svgToDataUri(svgString){
    return 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(svgString)));
  }

  function crearModal(){
    if(document.getElementById('plantilla-medidas-modal')) return;
    const html = `
    <div id="plantilla-medidas-modal" class="modal" style="display:none;">
      <div class="modal-content plantillas-modal">
        <div class="modal-header">
          <h2 id="pm-titulo">Plantilla de medidas — foto propia</h2>
          <button type="button" class="btn-close-x" onclick="PLANTILLAS_MEDIDAS.cerrar()">✕</button>
        </div>
        <div class="plantillas-body">
          <div class="plantillas-izq">
            <label id="pm-label-cliente">Cliente</label>
            <select id="pm-cliente"></select>
            <label id="pm-label-clase">Clase de documento</label>
            <select id="pm-clase">
              <option value="presupuesto">Presupuesto</option>
              <option value="pedido">Pedido directo</option>
            </select>
            <label id="pm-label-fecha">Fecha</label>
            <input type="date" id="pm-fecha"/>
            <label>Referencia / nº</label>
            <input type="text" id="pm-referencia" placeholder="P-2026-001"/>
            <label>Imagen de la plantilla (foto de la empresa)</label>
            <div class="pm-upload-row" style="display:flex;gap:6px;flex-wrap:wrap;">
              <button id="pm-btn-foto" class="btn btn-secondary btn-sm">📷 Cámara</button>
              <button id="pm-btn-archivo" class="btn btn-secondary btn-sm">📂 Archivo</button>
            </div>
            <input type="file" id="pm-file-input" accept="image/*" style="display:none"/>
            <div id="pm-guardadas-wrap">
              <label>Plantillas guardadas</label>
              <div id="pm-guardadas" class="pm-guardadas" style="max-height:150px;overflow-y:auto;border:1px solid #d6dce5;border-radius:6px;padding:4px;"></div>
            </div>
            <button id="pm-btn-guardar" class="btn btn-primary">💾 Guardar plantilla</button>
          </div>
          <div class="plantillas-der">
            <div class="plantillas-toolbar">
              <button id="pm-btn-ampliar" class="btn btn-secondary btn-sm">🔍 Ampliar</button>
              <button id="pm-btn-lapiz" class="btn btn-secondary btn-sm">✏️ Lápiz</button>
              <button id="pm-btn-goma" class="btn btn-secondary btn-sm">🧽 Goma</button>
              <button id="pm-btn-limpiar-lapiz" class="btn btn-secondary btn-sm">🧹 Borrar notas</button>
            </div>
            <div id="pm-visor" class="plantillas-visor">
              <canvas id="pm-canvas" width="600" height="440"></canvas>
            </div>
            <div id="pm-ayuda" class="plantillas-ayuda">Sube la foto de la plantilla, márcala con el lápiz y pulsa “Guardar plantilla”.</div>
          </div>
        </div>
      </div>
    </div>`;
    document.body.insertAdjacentHTML('beforeend', html);

    const m = document.getElementById('plantilla-medidas-modal');
    m.querySelector('.modal-content').addEventListener('click', e=>e.stopPropagation());
    document.getElementById('pm-btn-guardar').addEventListener('click', guardar);
    document.getElementById('pm-btn-ampliar').addEventListener('click', abrirPantallaCompleta);
    document.getElementById('pm-btn-lapiz').addEventListener('click', ()=>fijarHerramienta('lapiz'));
    document.getElementById('pm-btn-goma').addEventListener('click', ()=>fijarHerramienta('goma'));
    document.getElementById('pm-btn-limpiar-lapiz').addEventListener('click', limpiarLapiz);
    document.getElementById('pm-btn-foto').addEventListener('click', ()=>abrirCaptura('camara'));
    document.getElementById('pm-btn-archivo').addEventListener('click', ()=>abrirCaptura('archivo'));
    document.getElementById('pm-file-input').addEventListener('change', e=>{
      const f = e.target.files && e.target.files[0];
      if(f) cargarDesdeArchivo(f);
      e.target.value = '';
    });
    ['pm-cliente','pm-clase','pm-fecha','pm-referencia'].forEach(id=>{
      document.getElementById(id).addEventListener('change', pintar);
    });
    estado.modal = m;
  }

  // ── Cargar imagen desde cámara o archivo ──
  function abrirCaptura(modo){
    try{
      const input = document.getElementById('pm-file-input');
      input.setAttribute('capture', modo==='camara' ? 'environment' : '');
    }catch(e){}
    document.getElementById('pm-file-input').click();
  }
  function cargarDesdeArchivo(file){
    const reader = new FileReader();
    reader.onload = ()=>{
      estado.datosPlantilla.fotoBase64 = reader.result;
      estado.datosPlantilla.fotoNombre = file.name || 'plantilla';
      estado.datosPlantilla.notasBase64 = null;
      pintar();
    };
    reader.readAsDataURL(file);
  }

  // ── Lista de plantillas guardadas ──
  function pintarGuardadas(){
    const cont = document.getElementById('pm-guardadas');
    if(!cont) return;
    const lista = listar();
    if(!lista.length){
      cont.innerHTML = '<div style="color:#8a93a5;font-size:12px;padding:6px;">Aún no hay plantillas guardadas.</div>';
      return;
    }
    cont.innerHTML = lista.map(p=>`
      <div style="display:flex;align-items:center;gap:6px;padding:4px 2px;border-bottom:1px solid #eef1f6;">
        <span style="flex:1;font-size:12px;">${_esc(p.referencia||'Sin ref')} — ${_esc(p.fecha||'')}${p.fotoBase64?' · 📷':''}</span>
        <button class="btn btn-secondary btn-sm" data-cargar="${p.id}">Abrir</button>
        <button class="btn btn-secondary btn-sm" data-pdf="${p.id}">PDF</button>
        <button class="btn btn-danger btn-sm" data-borrar="${p.id}">🗑</button>
      </div>`).join('');
    cont.querySelectorAll('[data-cargar]').forEach(b=>b.addEventListener('click', ()=>{
      const p = listar().find(x=>x.id===b.dataset.cargar);
      if(!p) return;
      estado.datosPlantilla = p;
      document.getElementById('pm-cliente').value = p.clienteId || '';
      document.getElementById('pm-clase').value = p.clase || 'presupuesto';
      document.getElementById('pm-fecha').value = p.fecha || '';
      document.getElementById('pm-referencia').value = p.referencia || '';
      pintar();
    }));
    cont.querySelectorAll('[data-pdf]').forEach(b=>b.addEventListener('click', ()=>{
      const p = listar().find(x=>x.id===b.dataset.pdf);
      if(p) exportarPDF(p);
    }));
    cont.querySelectorAll('[data-borrar]').forEach(b=>b.addEventListener('click', ()=>{
      guardarEnLista({ id: b.dataset.borrar, _borrar: true });
      const restantes = listar().filter(x=>x.id!==b.dataset.borrar);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(restantes));
      pintarGuardadas();
    }));
  }

  // ── Exportar la plantilla anotada a PDF (para administración) ──
  function exportarPDF(p){
    const doc = new window.jspdf.jsPDF({orientation:'landscape',unit:'mm',format:'a4'});
    doc.setFontSize(16);
    doc.text('AutoPuerta Pro — Plantilla de medidas', 14, 16);
    doc.setFontSize(11);
    doc.text('Cliente: ' + (p.clienteNombre || '—'), 14, 26);
    doc.text('Tipo: ' + (p.clase==='pedido'?'Pedido directo':'Presupuesto'), 150, 26);
    doc.text('Fecha: ' + (p.fecha || '—'), 14, 33);
    doc.text('Ref: ' + (p.referencia || '—'), 150, 33);
    if(p.fotoBase64){
      doc.addPage();
      doc.setFontSize(12);
      doc.text('Foto original de la empresa', 14, 16);
      try{ doc.addImage(p.fotoBase64, 'JPEG', 14, 22, 267, 150); }
      catch(e){ try{ doc.addImage(p.fotoBase64, 'PNG', 14, 22, 267, 150); }catch(e2){} }
    }
    if(p.notasBase64){
      doc.addPage();
      doc.setFontSize(12);
      doc.text('Plantilla anotada (lo marcado pasa a administración)', 14, 16);
      try{ doc.addImage(p.notasBase64, 'PNG', 14, 22, 267, 150); }catch(e){}
    }
    doc.save('plantilla_' + (p.referencia || p.fecha || 'medidas') + '.pdf');
  }

  function pintar(){
    const c = estado.canvas, ctx = estado.ctx;
    if(!c || !ctx) return;
    ctx.clearRect(0,0,c.width,c.height);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0,0,c.width,c.height);
    // Encabezado
    ctx.fillStyle = '#1e3a5f';
    ctx.font = 'bold 13px sans-serif';
    ctx.fillText('AutoPuerta Pro — Plantilla de medidas', 12, 20);
    const cliSel = document.getElementById('pm-cliente');
    const cliNombre = cliSel?.selectedOptions[0]?.textContent || '';
    const clase = document.getElementById('pm-clase')?.value || 'presupuesto';
    ctx.font = '11px sans-serif';
    ctx.fillText('Cliente: ' + cliNombre, 12, 38);
    ctx.fillText('Clase: ' + (clase==='pedido'?'PEDIDO DIRECTO':'PRESUPUESTO'), 200, 38);
    ctx.fillText('Fecha: ' + (document.getElementById('pm-fecha')?.value || '—'), 12, 56);
    ctx.fillText('Ref: ' + (document.getElementById('pm-referencia')?.value || '—'), 200, 56);
    ctx.fillStyle = '#94a3b8';
    ctx.fillText('Foto de la empresa: ' + (estado.datosPlantilla?.fotoNombre || '(sin cargar)'), 12, c.height-8);
    // Imagen base (foto subida) o mensaje
    if(estado.datosPlantilla?.fotoBase64){
      const img = new Image();
      img.onload = ()=> {
        const escala = Math.min((c.width-24)/img.width, (c.height-70)/img.height);
        const w = img.width*escala, h = img.height*escala;
        estado._rect = {x:(c.width-w)/2, y:(60+((c.height-70)-h)/2), w, h};
        ctx.drawImage(img, (c.width-w)/2, 60+((c.height-70)-h)/2, w, h);
        // Restaurar notas encima
        if(estado.datosPlantilla?.notasBase64){
          const n = new Image();
          n.onload = ()=> ctx.drawImage(n, 0, 0, c.width, c.height);
          n.src = estado.datosPlantilla.notasBase64;
        }
      };
      img.src = estado.datosPlantilla.fotoBase64;
    } else {
      ctx.fillStyle = '#94a3b8';
      ctx.font = '14px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('Usa “Cámara” o “Archivo” para subir la plantilla de la empresa', c.width/2, (c.height+60)/2);
      ctx.textAlign = 'start';
    }
  }

  function abrir(opts){
    crearModal();
    estado.callbacks = opts;
    estado.datosPlantilla = opts.plantilla || {};
    const modal = estado.modal;
    // Rellenar clientes
    const sel = document.getElementById('pm-cliente');
    sel.innerHTML = (opts.clientes||[]).map(c=>
      `<option value="${c.id}" ${c.id===estado.datosPlantilla.clienteId?'selected':''}>${escapeHtml(c.nombre)}</option>`).join('');
    if(!opts.clientes?.length){
      sel.innerHTML = '<option value="">— Sin clientes —</option>';
    }
    // Clase / fecha / ref
    document.getElementById('pm-clase').value = estado.datosPlantilla.clase || 'presupuesto';
    document.getElementById('pm-fecha').value = estado.datosPlantilla.fecha || new Date().toISOString().slice(0,10);
    document.getElementById('pm-referencia').value = estado.datosPlantilla.referencia || '';
    document.getElementById('pm-ayuda').textContent =
      'Sube la foto de la plantilla (cámara o archivo), márcala con el lápiz y guarda. El PDF se envía a administración.';
    modal.style.display = 'flex';
    estado.canvas = document.getElementById('pm-canvas');
    estado.ctx = estado.canvas.getContext('2d');
    pintar();
    pintarGuardadas();
  }

  function guardar(){
    estado.datosPlantilla = {
      ...estado.datosPlantilla,
      clienteId: document.getElementById('pm-cliente').value,
      clienteNombre: document.getElementById('pm-cliente')?.selectedOptions[0]?.textContent || '',
      clase: document.getElementById('pm-clase').value,
      fecha: document.getElementById('pm-fecha').value,
      referencia: document.getElementById('pm-referencia').value
    };
    // Exportar canvas completo con notas si hay lápiz
    try{
      estado.datosPlantilla.notasBase64 = estado.canvas.toDataURL('image/png');
    }catch(e){}
    if(!estado.datosPlantilla.id) estado.datosPlantilla.id = 'pm_' + Date.now();
    guardarEnLista(estado.datosPlantilla);
    pintarGuardadas();
    if(estado.callbacks?.onGuardar) estado.callbacks.onGuardar(estado.datosPlantilla);
    cerrar();
  }

  function cerrar(){
    if(estado.modal) estado.modal.style.display = 'none';
    estado.dibujoActivo = false;
    document.body.style.overflow = '';
    if(document.getElementById('pm-fullscreen')) document.getElementById('pm-fullscreen').remove();
  }

  function abrirPantallaCompleta(){
    const data = estado.canvas.toDataURL('image/png');
    document.body.style.overflow = 'hidden';
    const fs = document.createElement('div');
    fs.id = 'pm-fullscreen';
    fs.style.cssText = 'position:fixed;inset:0;background:#0f172a;z-index:10001;display:flex;flex-direction:column;';
    fs.innerHTML = `
      <div style="padding:8px 14px;background:#1e3a5f;color:#fff;display:flex;justify-content:space-between;align-items:center;">
        <span>Modo pantalla completa — dibuja con el ratón (lápiz activado)</span>
        <div>
          <button id="pm-fs-lapiz" class="btn btn-secondary btn-sm">✏️ Lápiz</button>
          <button id="pm-fs-limpiar" class="btn btn-secondary btn-sm">🧹 Limpiar</button>
          <button id="pm-fs-salir" class="btn btn-primary btn-sm">✕ Salir</button>
        </div>
      </div>
      <div style="flex:1;display:flex;align-items:center;justify-content:center;overflow:auto;">
        <canvas id="pm-canvas-fs" width="1000" height="700" style="background:#fff;border-radius:6px;cursor:crosshair;"></canvas>
      </div>`;
    document.body.appendChild(fs);
    const c = document.getElementById('pm-canvas-fs');
    const ctx = c.getContext('2d');
    ctx.fillStyle='#fff'; ctx.fillRect(0,0,c.width,c.height);
    const img = new Image();
    img.onload = ()=> ctx.drawImage(img, 0, 0, c.width, c.height);
    img.src = data;
    let dibujando = false;
    const pos = e=>{
      const r = c.getBoundingClientRect();
      return { x: (e.clientX-r.left)*(c.width/r.width), y: (e.clientY-r.top)*(c.height/r.height) };
    };
    c.addEventListener('pointerdown', e=>{ dibujando=true; const p=pos(e); ctx.beginPath(); ctx.moveTo(p.x,p.y); });
    c.addEventListener('pointermove', e=>{ if(!dibujando) return; const p=pos(e); ctx.lineTo(p.x,p.y); ctx.strokeStyle='#e11d48'; ctx.lineWidth=2.5; ctx.lineCap='round'; ctx.stroke(); });
    c.addEventListener('pointerup', ()=>{ dibujando=false; });
    document.getElementById('pm-fs-lapiz').addEventListener('click', ()=>{ /* lápiz ya activo por defecto */ });
    document.getElementById('pm-fs-limpiar').addEventListener('click', ()=>{ ctx.fillStyle='#fff'; ctx.fillRect(0,0,c.width,c.height); ctx.drawImage(img,0,0,c.width,c.height); });
    document.getElementById('pm-fs-salir').addEventListener('click', ()=>{
      // Volcar pantalla completa al canvas pequeño
      const dst = estado.ctx;
      dst.clearRect(0,0,estado.canvas.width,estado.canvas.height);
      dst.drawImage(c, 0, 0, estado.canvas.width, estado.canvas.height);
      estado.datosPlantilla.notasBase64 = estado.canvas.toDataURL('image/png');
      fs.remove();
      document.body.style.overflow = '';
    });
  }

  function fijarHerramienta(tipo){
    estado.herramienta = tipo;
    estado.dibujoActivo = true;
    const c = estado.canvas;
    if(!c) return;
    c.style.cursor = 'crosshair';
    if(estado._drawHandlers){
      c.removeEventListener('pointerdown', estado._drawHandlers.down);
      c.removeEventListener('pointermove', estado._drawHandlers.move);
      c.removeEventListener('pointerup', estado._drawHandlers.up);
    }
    const pos = e=>{
      const r = c.getBoundingClientRect();
      return { x:(e.clientX-r.left)*(c.width/r.width), y:(e.clientY-r.top)*(c.height/r.height) };
    };
    let d = false;
    const down = e=>{ d=true; const p=pos(e); estado.ctx.beginPath(); estado.ctx.moveTo(p.x,p.y); };
    const move = e=>{
      if(!d) return;
      const p = pos(e);
      estado.ctx.lineTo(p.x,p.y);
      if(estado.herramienta==='goma'){ estado.ctx.strokeStyle='#ffffff'; estado.ctx.lineWidth=14; }
      else { estado.ctx.strokeStyle='#e11d48'; estado.ctx.lineWidth=2.5; }
      estado.ctx.lineCap='round'; estado.ctx.lineJoin='round'; estado.ctx.stroke();
    };
    const up = ()=>{ d=false; };
    c.addEventListener('pointerdown', down);
    c.addEventListener('pointermove', move);
    c.addEventListener('pointerup', up);
    estado._drawHandlers = {down,move,up};
  }

  function limpiarLapiz(){
    estado.datosPlantilla.notasBase64 = null;
    pintar();
  }

  return { abrir, cerrar, PLANTILLAS, toggleLapiz: ()=>fijarHerramienta('lapiz') };
})();
