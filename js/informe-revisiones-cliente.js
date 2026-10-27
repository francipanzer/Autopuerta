// ═══════════════════════════════════════════════════════════
//  REVISIONES — página única (reemplaza "Revisiones")
//  · Motor único getEstadoRevisiones(): una fila por ruta (cadena) o cliente único
//  · Pestañas: Próximas / Historial, con buscador por cliente y fecha
//  · Botón "+ Nueva revisión" (cliente/cadena + fecha) que abre el formulario
//  · Cliente único: "Le toca revisión el <fecha>" (sin desglose por puerta)
// ═══════════════════════════════════════════════════════════
(function(){
'use strict';

// ── Helpers de fecha/estado ──
function _dias(fecha){
  if(!fecha) return null;
  const hoy=new Date(); hoy.setHours(0,0,0,0);
  const f=new Date(fecha); f.setHours(0,0,0,0);
  return Math.ceil((f-hoy)/86400000);
}
function _badge(fecha){
  const d=_dias(fecha);
  if(d===null)   return {texto:'Sin programar', clase:'badge-yellow'};
  if(d<0)        return {texto:'Vencida '+Math.abs(d)+'d', clase:'badge-red'};
  if(d===0)      return {texto:'Hoy', clase:'badge-red'};
  if(d<=30)      return {texto:'En '+d+'d', clase:'badge-yellow'};
  return {texto:'Al día', clase:'badge-green'};
}
function _fmt(f){ try{ return f?new Date(f).toLocaleDateString('es-ES'):'—'; }catch(e){ return String(f||'—'); } }
function _esc(s){ return String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }

// ═══════════════════════════════════════════════════════════
//  MOTOR ÚNICO — getEstadoRevisiones()
//  Fuente de verdad compartida por la página, el badge y el PDF.
//  Devuelve una fila por ruta (cadenas) o por cliente único,
//  ordenada por fecha de próxima revisión.
// ═══════════════════════════════════════════════════════════
window.getEstadoRevisiones = async function(){
  const [clientes,cadenas,rutas]=await Promise.all([dbGetAll('clientes'),dbGetAll('cadenas'),dbGetAll('rutas')]);
  const cadenaIds=new Set(cadenas.map(c=>String(c.id)));
  const rutasDeCadena=new Set(rutas.map(r=>String(r.id)));
  const items=[];

  // Cadenas: una fila por cada ruta
  for(const cadena of cadenas){
    for(const ruta of rutas.filter(r=>String(r.cadenaId??r.cadenaid??'')===String(cadena.id))){
      let puertas=[];
      try{ puertas=await window.getPuertasDeRuta(ruta.id,cadena.id); }catch(e){ puertas=[]; }
      const proximaPuertas=puertas.map(p=>p.proximaRevision).filter(Boolean).sort()[0]||null;
      items.push({
        tipo:'cadena', esCadena:true,
        id:String(cadena.id), nombre:cadena.nombre,
        rutaId:String(ruta.id), rutaNombre:ruta.nombre||'Ruta',
        proximaRevision:ruta.proximaRevision??ruta.proximarevision??proximaPuertas??null,
        ultimaRevision:ruta.ultimaRevision??ruta.ultimorevision??null,
        puertas
      });
    }
  }

  // Clientes únicos (sin cadena ni ruta de cadena)
  for(const c of clientes){
    const cid=String(c.cadenaId??c.cadenaid??c.padreId??c.padreid??'');
    const rid=String(c.rutaId??c.rutaid??'');
    if((cid&&cadenaIds.has(cid))||(rid&&rutasDeCadena.has(rid))) continue;
    const puertas=await dbGetByIndex('puertas','clienteId',c.id);
    items.push({
      tipo:'cliente', esCadena:false,
      id:String(c.id), nombre:c.nombre,
      rutaId:null, rutaNombre:null,
      proximaRevision:puertas.map(p=>p.proximaRevision).filter(Boolean).sort()[0]||null,
      ultimaRevision:puertas.map(p=>p.ultimaRevision).filter(Boolean).sort().pop()||null,
      puertas
    });
  }

  items.sort((a,b)=>String(a.proximaRevision||'9999').localeCompare(String(b.proximaRevision||'9999')));
  return items;
};

// ═══════════════════════════════════════════════════════════
//  PÁGINA: Revisiones (pestañas Próximas / Historial + buscador)
// ═══════════════════════════════════════════════════════════
window.render_revisionesCliente=async function(main){
  if(!main) main=document.getElementById('mainContent');
  main.innerHTML=
    '<div class="page-revisiones">'+
      '<div class="page-header"><div>'+
        '<h2 class="page-revisiones-title"><i class="fas fa-clipboard-list"></i> Revisiones</h2>'+
        '<p class="page-revisiones-subtitle">Próximas revisiones, historial y registro de nuevas revisiones.</p>'+
      '</div><div class="header-actions">'+
        '<button class="btn btn-primary" onclick="window.abrirNuevaRevision()"><i class="fas fa-plus"></i> Nueva revisión</button>'+
      '</div></div>'+
      '<div class="rev-search">'+
        '<input id="rev-q" class="input" type="search" placeholder="Buscar por cliente, cadena o ruta…" oninput="window.__revRefrescar()">'+
        '<input id="rev-fecha" class="input" type="date" onchange="window.__revRefrescar()" title="Filtrar por fecha">'+
        '<button class="btn btn-outline" onclick="window.__revLimpiarFiltro()" title="Limpiar filtros"><i class="fas fa-eraser"></i></button>'+
      '</div>'+
      '<div class="rev-tabs">'+
        '<button class="btn rev-tab active" id="rev-tab-proximas" onclick="window.__revTab(\'proximas\')"><i class="fas fa-calendar"></i> Próximas</button>'+
        '<button class="btn rev-tab" id="rev-tab-historial" onclick="window.__revTab(\'historial\')"><i class="fas fa-clock-rotate-left"></i> Historial</button>'+
      '</div>'+
      '<div id="rev-lista"></div>'+
    '</div>';
  window.__revEstado={tab:'proximas', abiertos:new Set()};
  await window.__revRefrescar();
};

window.__revLimpiarFiltro=function(){
  const q=document.getElementById('rev-q'); const f=document.getElementById('rev-fecha');
  if(q) q.value=''; if(f) f.value='';
  window.__revRefrescar();
};

window.__revTab=function(tab){
  window.__revEstado.tab=tab;
  document.getElementById('rev-tab-proximas')?.classList.toggle('active',tab==='proximas');
  document.getElementById('rev-tab-historial')?.classList.toggle('active',tab==='historial');
  window.__revRefrescar();
};

function _filtros(){
  const q=String(document.getElementById('rev-q')?.value||'').toLowerCase().trim();
  const fecha=String(document.getElementById('rev-fecha')?.value||'').slice(0,10);
  return {q,fecha};
}

window.__revRefrescar=async function(){
  const cont=document.getElementById('rev-lista');
  if(!cont) return;
  cont.innerHTML='<p style="color:var(--gray);padding:12px;">Cargando…</p>';
  if(window.__revEstado.tab==='proximas') await window.__revPintarProximas(cont);
  else await window.__revPintarHistorial(cont);
};

// --- Pestana PROXIMAS ---
// Una fila por cadena (o cliente unico). Al pulsar una cadena se navega a una
// vista dedicada con sus rutas (mejor en movil que un desplegable anidado);
// al pulsar una ruta, a una vista de tiendas estilo cliente unico.
// Delegacion de eventos en el contenedor: los botones sobreviven a cada re-render.
window.__revPintarProximas=async function(cont){
  const {q,fecha}=_filtros();
  let items=await window.getEstadoRevisiones();
  if(q) items=items.filter(i=>i.nombre.toLowerCase().includes(q)||(i.rutaNombre||'').toLowerCase().includes(q));
  if(fecha) items=items.filter(i=>String(i.proximaRevision||'').slice(0,10)===fecha);

  if(!items.length){
    cont.innerHTML='<div class="empty-state"><i class="fas fa-check-circle"></i><h3>Sin resultados</h3><p>No hay clientes ni rutas que coincidan con la busqueda.</p></div>';
    return;
  }

  // Agrupar filas por cadena (o cliente unico sin cadena)
  const grupos=new Map();
  for(const it of items){
    const gid=it.esCadena?('C:'+it.id):('K:'+it.id);
    if(!grupos.has(gid)) grupos.set(gid,{esCadena:it.esCadena,id:it.id,nombre:it.nombre,proximaRevision:it.proximaRevision,filas:[]});
    grupos.get(gid).filas.push(it);
  }

  cont.innerHTML=[...grupos.values()].map(g=>{
    const badge=_badge(g.proximaRevision);
    const esCadena=g.esCadena;
    const icon=esCadena?'fa-sitemap':'fa-user';
    const nItems=esCadena?g.filas.length:g.filas.flatMap(f=>f.puertas).length;
    const unidades=esCadena?('ruta'+(nItems===1?'':'s')):('puerta'+(nItems===1?'':'s'));
    return '<div class="rev-fila rev-grupo" data-navigate="'+(esCadena?'rutas':'tiendas')+'" data-id="'+_esc(g.id)+'">'+
      '<div class="rev-fila-info">'+
        '<strong><i class="fas '+icon+'"></i> '+_esc(g.nombre)+'</strong>'+
        '<span class="rev-fecha">'+(g.proximaRevision?'Le toca revision el '+_fmt(g.proximaRevision):'Sin revision programada')+' - '+nItems+' '+unidades+'</span>'+
      '</div>'+
      '<div class="rev-fila-meta">'+
        '<span class="badge '+badge.clase+'">'+badge.texto+'</span>'+
        '<i class="fas fa-chevron-right rev-chevron"></i>'+
      '</div>'+
    '</div>';
  }).join('');

  // Delegacion de eventos (una vez por contenedor)
  if(!cont.__delegado){
    cont.__delegado=true;
    cont.addEventListener('click',function(e){
      const fila=e.target.closest('[data-navigate]');
      if(!fila) return;
      const tipo=fila.getAttribute('data-navigate');
      const id=fila.getAttribute('data-id');
      if(tipo==='rutas') window.verRutasDeCadena(id);
      else window.verTiendasDeCliente(id);
    });
  }
};

// --- VISTA: rutas de una cadena (pagina propia, con boton Volver) ---
window.verRutasDeCadena=async function(cadenaId){
  const main=document.getElementById('mainContent');
  if(!main) return;
  const items=await window.getEstadoRevisiones();
  const filas=items.filter(i=>i.esCadena&&String(i.id)===String(cadenaId));
  const nombre=filas[0]?.nombre||'Cadena';
  const proxima=filas.map(f=>f.proximaRevision).filter(Boolean).sort()[0];

  main.innerHTML=
    '<div class="page-revisiones">'+
      '<div class="page-header"><div>'+
        '<button class="btn btn-back btn-sm" onclick="navigateTo(\'revisionesCliente\')"><i class="fas fa-arrow-left"></i> Volver</button>'+
      '</div><div>'+
        '<h2 class="page-revisiones-title"><i class="fas fa-sitemap"></i> '+_esc(nombre)+'</h2>'+
        '<p class="page-revisiones-subtitle">'+filas.length+' ruta'+(filas.length===1?'':'s')+(proxima?' - proxima revision el '+_fmt(proxima):'')+'</p>'+
      '</div></div>'+
      '<div id="rev-lista-rutas"></div>'+
    '</div>';

  const cont=document.getElementById('rev-lista-rutas');
  // Contar tiendas reales (con o sin puertas), no puertas
  const counts = new Map();
  for (const r of filas) {
    let tiendas = [];
    try { tiendas = await window.getTiendasDeRuta(r.rutaId, r.id); } catch (e) { tiendas = []; }
    counts.set(r.rutaId, tiendas.length);
  }
  cont.innerHTML=filas.length
    ? filas.map(r=>{
        const badge=_badge(r.proximaRevision);
        const nTiendas=counts.get(r.rutaId)||r.puertas.length;
        return '<div class="rev-fila" data-ruta="'+_esc(r.rutaId)+'">'+
          '<div class="rev-fila-info">'+
            '<strong><i class="fas fa-route"></i> '+_esc(r.rutaNombre)+'</strong>'+
            '<span class="rev-fecha">'+(r.proximaRevision?'Le toca revision el '+_fmt(r.proximaRevision):'Sin revision programada')+' - '+nTiendas+' tienda'+(nTiendas===1?'':'s')+'</span>'+
          '</div>'+
          '<div class="rev-fila-meta">'+
            '<span class="badge '+badge.clase+'">'+badge.texto+'</span>'+
            '<i class="fas fa-chevron-right rev-chevron"></i>'+
          '</div>'+
        '</div>';
      }).join('')
    : '<div class="empty-state"><i class="fas fa-route"></i><h3>Sin rutas</h3><p>Esta cadena no tiene rutas creadas.</p></div>';

  if(!cont.__delegado){
    cont.__delegado=true;
    cont.addEventListener('click',e=>{
      const fila=e.target.closest('[data-ruta]');
      if(fila) window.verTiendasDeRuta(cadenaId, fila.getAttribute('data-ruta'));
    });
  }
};

// --- VISTA: tiendas de una ruta (estilo cliente unico: tienda como encabezado) ---
window.verTiendasDeRuta=async function(cadenaId, rutaId){
  const main=document.getElementById('mainContent');
  if(!main) return;
  const items=await window.getEstadoRevisiones();
  const fila=items.find(i=>i.esCadena&&String(i.id)===String(cadenaId)&&String(i.rutaId)===String(rutaId));
  if(!fila){
    showToast('No se encontro la ruta','error');
    return window.verRutasDeCadena(cadenaId);
  }

  const cadenaNombre=fila.nombre;
  let tiendas=[];
  try{ tiendas=await window.getTiendasDeRuta(rutaId,cadenaId); }catch(e){ tiendas=[]; }
  main.innerHTML=
    '<div class="page-revisiones">'+
      '<div class="page-header"><div>'+
        '<button class="btn btn-back btn-sm" data-volver-cadena="1"><i class="fas fa-arrow-left"></i> Volver</button>'+
      '</div><div>'+
        '<h2 class="page-revisiones-title"><i class="fas fa-route"></i> '+_esc(fila.rutaNombre)+'</h2>'+
        '<p class="page-revisiones-subtitle">'+_esc(cadenaNombre)+' - '+tiendas.length+' tienda'+(tiendas.length===1?'':'s')+(fila.proximaRevision?' - proxima el '+_fmt(fila.proximaRevision):'')+'</p>'+
      '</div><div class="header-actions">'+
        '<button class="btn btn-primary" data-accion="registrar" data-id="'+_esc(cadenaId)+'" data-es-cadena="1" data-ruta-id="'+_esc(rutaId)+'"><i class="fas fa-clipboard-check"></i> Registrar revision</button>'+
        '<button class="btn btn-outline" data-accion="pdf" data-id="'+_esc(cadenaId)+'" data-es-cadena="1" data-ruta-id="'+_esc(rutaId)+'"><i class="fas fa-file-pdf"></i> PDF de la ruta</button>'+
      '</div></div>'+
      '<div id="rev-lista-tiendas"></div>'+
    '</div>';

  const cont=document.getElementById('rev-lista-tiendas');
  // Mapa de puertas por tienda
  const porTienda=new Map();
  fila.puertas.forEach(p=>{
    const key=p.clienteNombre||'(sin tienda)';
    if(!porTienda.has(key)) porTienda.set(key,[]);
    porTienda.get(key).push(p);
  });
  // Incluir tiendas sin puertas
  tiendas.forEach(t=>{ const n=t.nombre||'(sin nombre)'; if(!porTienda.has(n)) porTienda.set(n,[]); });
  const bRuta=_badge(fila.proximaRevision);
  cont.innerHTML=porTienda.size
    ? [...porTienda.entries()].map(([tienda,puertas])=>{
        return '<div class="rev-tienda-bloque">'+
          '<div class="rev-tienda-cab"><strong><i class="fas fa-store"></i> '+_esc(tienda)+'</strong>'+
            (puertas.length?'<span class="badge '+bRuta.clase+' badge-sm">'+bRuta.texto+'</span>':'<span class="badge badge-yellow badge-sm">Sin puertas</span>')+'</div>'+
          (puertas.length
            ? '<div class="rev-tienda-puertas">'+puertas.map(p=>{
                const pb=_badge(p.proximaRevision);
                return '<div class="revision-puerta-item"><div><strong>'+_esc(p.nombre||'Puerta')+'</strong>'+
                  '<span class="revision-puerta-tipo">'+_esc(p.puertaTipo||p.tipo||'—')+'</span>'+
                  (p.proximaRevision?'<div class="revision-puerta-fecha">Última: '+_fmt(p.ultimaRevision)+' · Próxima: '+_fmt(p.proximaRevision)+'</div>':'')+
                  '</div><span class="badge '+pb.clase+' badge-sm">'+pb.texto+'</span></div>';
              }).join('')+'</div>'
            : '<p style="color:var(--gray);padding:6px 14px;">Sin puertas registradas. Se añadirán al hacer la primera revisión.</p>')+
        '</div>';
      }).join('')
    : '<div class="empty-state"><i class="fas fa-store"></i><h3>Sin tiendas</h3><p>Esta ruta no tiene tiendas asignadas.</p></div>';

  // Delegacion: volver, registrar revision de ESTA ruta y PDF de ESTA ruta
  main.querySelector('.page-header').addEventListener('click',e=>{
    if(e.target.closest('[data-volver-cadena]')) return window.verRutasDeCadena(cadenaId);
    const btn=e.target.closest('button[data-accion]');
    if(!btn) return;
    const acc=btn.getAttribute('data-accion');
    const fecha=fila.proximaRevision||new Date().toISOString().slice(0,10);
    if(acc==='registrar') window.openHiperberReviewForm(cadenaId,null,{rutaId,fecha});
    if(acc==='pdf') window.generatePDF_informeCliente(cadenaId,true,rutaId);
  });
};

// --- VISTA: puertas de un cliente unico (pagina propia, estilo cliente unico) ---
window.verTiendasDeCliente=async function(clienteId){
  const main=document.getElementById('mainContent');
  if(!main) return;
  const items=await window.getEstadoRevisiones();
  const fila=items.find(i=>!i.esCadena&&String(i.id)===String(clienteId));
  if(!fila){
    showToast('No se encontro el cliente','error');
    return;
  }

  main.innerHTML=
    '<div class="page-revisiones">'+
      '<div class="page-header"><div>'+
        '<button class="btn btn-back btn-sm" onclick="navigateTo(\'revisionesCliente\')"><i class="fas fa-arrow-left"></i> Volver</button>'+
      '</div><div>'+
        '<h2 class="page-revisiones-title"><i class="fas fa-user"></i> '+_esc(fila.nombre)+'</h2>'+
        '<p class="page-revisiones-subtitle">'+fila.puertas.length+' puerta'+(fila.puertas.length===1?'':'s')+(fila.proximaRevision?' - proxima el '+_fmt(fila.proximaRevision):'')+'</p>'+
      '</div><div class="header-actions">'+
        '<button class="btn btn-primary" data-accion="registrar" data-id="'+_esc(clienteId)+'" data-es-cadena="0"><i class="fas fa-clipboard-check"></i> Registrar revision</button>'+
        '<button class="btn btn-outline" data-accion="pdf" data-id="'+_esc(clienteId)+'" data-es-cadena="0"><i class="fas fa-file-pdf"></i> PDF</button>'+
      '</div></div>'+
      '<div id="rev-lista-puertas"></div>'+
    '</div>';

  document.getElementById('rev-lista-puertas').innerHTML=fila.puertas.length
    ? fila.puertas.map(p=>{
        const b=_badge(p.proximaRevision);
        return '<div class="revision-puerta-item"><div><strong>'+_esc(p.nombre||'Puerta')+'</strong>'+
          '<span class="revision-puerta-tipo">'+_esc(p.puertaTipo||p.tipo||'—')+'</span>'+
          (p.proximaRevision?'<div class="revision-puerta-fecha">Ultima: '+_fmt(p.ultimaRevision)+' - Proxima: '+_fmt(p.proximaRevision)+'</div>':'')+
          '</div><span class="badge '+b.clase+' badge-sm">'+b.texto+'</span></div>';
      }).join('')
    : '<div class="empty-state"><i class="fas fa-door-open"></i><h3>Sin puertas</h3><p>Este cliente no tiene puertas registradas.</p></div>';

  main.querySelector('.page-header').addEventListener('click',e=>{
    const btn=e.target.closest('button[data-accion]');
    if(!btn) return;
    if(btn.getAttribute('data-accion')==='registrar') window.abrirFormularioRevisionCliente(clienteId, fila.proximaRevision||new Date().toISOString().slice(0,10));
    if(btn.getAttribute('data-accion')==='pdf') window.generatePDF_informeCliente(clienteId,false);
  });
};

// ── Pestaña HISTORIAL ──
window.__revPintarHistorial=async function(cont){
  const {q,fecha}=_filtros();
  const [revisiones,cadenas,clientes]=await Promise.all([dbGetAll('revisiones'),dbGetAll('cadenas'),dbGetAll('clientes')]);
  const chainNames=new Map(cadenas.map(c=>[String(c.id),c.nombre]));
  const clientNames=new Map(clientes.map(c=>[String(c.id),c.nombre]));

  let filas=revisiones.map(r=>({r,meta:window.revisionHistoryMetadata?window.revisionHistoryMetadata(r):{clientNames:[],technician:'',chainId:null,chainName:''}}));
  if(q) filas=filas.filter(({r,meta})=>{
    const nombre=(meta.chainName||chainNames.get(String(meta.chainId||''))||'')+' '+meta.clientNames.join(' ')+' '+(r.clienteId?clientNames.get(String(r.clienteId))||'':'');
    return nombre.toLowerCase().includes(q)||String(r.id).toLowerCase().includes(q);
  });
  if(fecha) filas=filas.filter(({r})=>String(r.fecha||'').slice(0,10)===fecha);
  filas.sort((a,b)=>String(b.r.fecha||'').localeCompare(String(a.r.fecha||'')));

  if(!filas.length){
    cont.innerHTML='<div class="empty-state"><i class="fas fa-inbox"></i><h3>Sin revisiones</h3><p>No hay revisiones registradas que coincidan con la búsqueda.</p></div>';
    return;
  }

  cont.innerHTML='<div class="table-wrapper"><table><thead><tr><th>Fecha</th><th>Cliente / cadena</th><th>Técnico</th><th>Equipos</th><th>Resultado</th><th></th></tr></thead><tbody id="rev-hist-tbody">'+
    filas.map(({r,meta})=>{
      const nombre=meta.chainName||chainNames.get(String(meta.chainId||''))||meta.clientNames.join(', ')||(r.clienteId?clientNames.get(String(r.clienteId)):'—');
      const crudo=r.estadoTrasRevision||((r.items||[]).some(i=>i.resultadoEstado==='x')?'Fuera de servicio':'Operativa');
      const resultado=String(crudo).replace(/_/g,' ');
      return '<tr><td>'+_esc(_fmt(r.fecha))+'</td><td>'+_esc(nombre||'—')+'</td><td>'+_esc(meta.technician||'—')+'</td>'+
        '<td>'+(r.items||[]).length+'</td><td>'+_esc(resultado.charAt(0).toUpperCase()+resultado.slice(1))+'</td>'+
        '<td><button class="btn btn-outline btn-sm" data-accion="pdf-rev" data-id="'+_esc(r.id)+'"><i class="fas fa-file-pdf"></i></button></td></tr>';
    }).join('')+'</tbody></table></div>';

  // Delegación de eventos del historial
  if(!cont.__delegadoHist){
    cont.__delegadoHist=true;
    cont.addEventListener('click',e=>{
      const btn=e.target.closest('button[data-accion="pdf-rev"]');
      if(btn) window.generatePDF_revision(btn.getAttribute('data-id'));
    });
  }
};

// ═══════════════════════════════════════════════════════════
//  NUEVA REVISIÓN — pide cliente (o cadena) y fecha
// ═══════════════════════════════════════════════════════════
window.abrirNuevaRevision=async function(cadenaPreseleccionada){
  const [clientes,cadenas,rutas]=await Promise.all([dbGetAll('clientes'),dbGetAll('cadenas'),dbGetAll('rutas')]);
  const cadenaIds=new Set(cadenas.map(c=>String(c.id)));
  const rutasDeCadena=new Set(rutas.map(r=>String(r.id)));

  const opcionesCadenas=cadenas.map(c=>'<option value="C:'+_esc(c.id)+'">'+_esc(c.nombre)+'</option>').join('');
  const clientesUnicos=clientes.filter(c=>{
    const cid=String(c.cadenaId??c.cadenaid??c.padreId??c.padreid??'');
    const rid=String(c.rutaId??c.rutaid??'');
    return !cadenaIds.has(cid)&&!rutasDeCadena.has(rid);
  });
  const opcionesClientes=clientesUnicos.map(c=>'<option value="K:'+_esc(c.id)+'">'+_esc(c.nombre)+'</option>').join('');

  const body=
    '<div class="form-grid">'+
      '<div class="form-group"><label>Cliente o cadena *</label>'+
        '<select id="nr-cliente" class="input">'+
          '<option value="">— Seleccionar —</option>'+
          '<optgroup label="Cadenas">'+opcionesCadenas+'</optgroup>'+
          '<optgroup label="Clientes">'+opcionesClientes+'</optgroup>'+
        '</select></div>'+
      '<div class="form-group"><label>Fecha de revisión *</label>'+
        '<input id="nr-fecha" type="date" class="input" value="'+new Date().toISOString().slice(0,10)+'"></div>'+
      '<p style="color:var(--text-muted);font-size:13px;margin:0;">Se abrirá el formulario de revisión con todas las puertas o tiendas del cliente seleccionado.</p>'+
    '</div>';
  const footer='<button class="btn btn-outline" onclick="cerrarFormularioRevision()">Cerrar</button>'+
    '<button class="btn btn-primary" onclick="window.__revIniciar()"><i class="fas fa-arrow-right"></i> Continuar</button>';
  openModal('Nueva revisión',body,footer);

  if(cadenaPreseleccionada){
    const sel=document.getElementById('nr-cliente');
    if(sel) sel.value='C:'+cadenaPreseleccionada;
  }
};

window.__revIniciar=async function(){
  const sel=document.getElementById('nr-cliente');
  const fecha=document.getElementById('nr-fecha').value;
  if(!sel||!sel.value) return showToast('Selecciona un cliente o cadena','error');
  if(!fecha) return showToast('Selecciona la fecha de revisión','error');
  const [tipo,id]=sel.value.split(':');
  closeModal();
  if(tipo==='C'){
    const cadenas=await dbGetAll('cadenas');
    const cadena=cadenas.find(c=>String(c.id)===id);
    const nombre=(cadena?.nombre||'').trim().toLocaleUpperCase('es-ES');
    if(nombre==='DOTICS') return window.openDoticsMaintenanceForm(id,null,fecha);
    return window.openHiperberReviewForm(id,fecha);
  }
  return window.abrirFormularioRevisionCliente(id,fecha);
};

// ═══════════════════════════════════════════════════════════
//  PDF — informe de revisiones (usa el motor único)
// ═══════════════════════════════════════════════════════════
window.generatePDF_informeCliente=async function(id, esCadena, rutaIdFiltro){
  await window.ensurePdfLibs?.();
  const doc=await createBrandedPDF('Informe de Revisiones','Estado de revisiones');
  let nombre='—', lineas=[];

  if(esCadena){
    const cadena=await dbGet('cadenas',id);
    nombre=cadena?.nombre||'Cadena';
    const rutas=await getRutasByCadena(id);
    const rutasFiltradas=rutaIdFiltro?rutas.filter(r=>String(r.id)===String(rutaIdFiltro)):rutas;
    for(const ruta of rutasFiltradas){
      let puertas=[];
      try{ puertas=await window.getPuertasDeRuta(ruta.id,id); }catch(e){ puertas=[]; }
      const proxima=ruta.proximaRevision??ruta.proximarevision??puertas.map(p=>p.proximaRevision).filter(Boolean).sort()[0];
      lineas.push(['RUTA: '+ruta.nombre+' ('+puertas.length+' tienda'+(puertas.length===1?'':'s')+')', proxima?_fmt(proxima):'Sin programar']);
      // Nombre de la tienda como encabezado de su grupo de puertas
      const porTienda=new Map();
      puertas.forEach(p=>{
        const key=p.clienteNombre||'(sin tienda)';
        if(!porTienda.has(key)) porTienda.set(key,[]);
        porTienda.get(key).push(p);
      });
      for(const [tienda,ps] of porTienda){
        lineas.push(['TIENDA: '+tienda, '']);
        for(const p of ps) lineas.push(['    '+((p.nombre||'Puerta')+' ('+(p.puertaTipo||'—')+')'), _fmt(p.proximaRevision)]);
      }
    }
  }else{
    const cliente=await dbGet('clientes',id);
    nombre=cliente?.nombre||'Cliente';
    const puertas=await dbGetByIndex('puertas','clienteId',id);
    const proxima=puertas.map(p=>p.proximaRevision).filter(Boolean).sort()[0];
    const badge=_badge(proxima);
    lineas.push(['Cliente', nombre]);
    lineas.push(['Próxima revisión', proxima?_fmt(proxima):'Sin programar']);
    lineas.push(['Estado', badge.texto]);
    lineas.push(['Puertas registradas', String(puertas.length)]);
    for(const p of puertas) lineas.push(['   · '+(p.nombre||'Puerta')+' ('+(p.puertaTipo||'—')+')', _fmt(p.proximaRevision)]);
  }

  doc.autoTable(pdfTableStyle({startY:38,head:[['Concepto','Detalle / fecha']],body:lineas,
    headStyles:{fillColor:PDF_BRAND.primary,textColor:255,fontSize:8,fontStyle:'bold',cellPadding:3},
    bodyStyles:{fontSize:8,cellPadding:2.5,textColor:PDF_BRAND.text}}));
  addPDFFootersAllPages(doc);
  const filename='revisiones_'+String(nombre).replace(/[^a-zA-Z0-9_-]/g,'_')+'_'+new Date().toISOString().slice(0,10)+'.pdf';
  doc.save(filename);
  showToast('Informe de revisiones generado');
};

})();
