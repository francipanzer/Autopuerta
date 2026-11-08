// ═══════════════════════════════════════════════════════════
//  REVISIONES — página única
//  · Motor: Central.getEstadoRevisiones() (js/central.js): una fila por cliente
//    con MANTENIMIENTO contratado.
//  · Cliente individual → al pulsarlo salen sus puertas.
//  · Cliente central    → al pulsarlo salen sus RUTAS; en cada ruta sus
//    UBICACIONES (naves) y en cada ubicación sus puertas.
//  · Pestañas Próximas / Historial, buscador por cliente, ruta o fecha.
// ═══════════════════════════════════════════════════════════
(function(){
'use strict';

const C = () => window.Central;
const _esc = s => escapeHtml(s);
const _badge = f => C().badgeFecha(f);
const _fmt = f => C().fmt(f);
const hoyISO = () => window.Periodicidad.hoyISO();
const plural=(n,s,p)=>n+' '+(n===1?s:p);

// ── Fila de lista clicable ──
function filaHTML({icono, titulo, detalle, fecha, dataAttr, botonRevisar}){
  const b=_badge(fecha);
  return '<div class="rev-fila" '+dataAttr+'>'+
    '<div class="rev-fila-info"><strong><i class="fas '+icono+'"></i> '+_esc(titulo)+'</strong>'+
      '<span class="rev-fecha">'+(fecha?'Le toca revisión el '+_fmt(fecha):'Sin revisión programada')+(detalle?' · '+detalle:'')+'</span></div>'+
    '<div class="rev-fila-meta">'+(botonRevisar||'')+'<span class="badge '+b.clase+'">'+b.texto+'</span><i class="fas fa-chevron-right rev-chevron"></i></div></div>';
}

function cabecera({volver, icono, titulo, subtitulo, acciones}){
  return '<div class="page-header"><div>'+(volver?'<button class="btn btn-back btn-sm" data-volver="1"><i class="fas fa-arrow-left"></i> Volver</button>':'')+'</div><div>'+
    '<h2 class="page-revisiones-title"><i class="fas '+icono+'"></i> '+_esc(titulo)+'</h2>'+
    '<p class="page-revisiones-subtitle">'+subtitulo+'</p></div>'+
    '<div class="header-actions">'+(acciones||'')+'</div></div>';
}

function bloquePuertas(puertas){
  if(!puertas.length) return '<p style="color:var(--gray);padding:6px 14px;">Sin puertas registradas.</p>';
  return puertas.map(p=>{
    const pb=_badge(p.proximaRevision);
    const per=window.Periodicidad.frecuenciaMeses(p);
    return '<div class="revision-puerta-item"><div><strong>'+_esc(p.nombre||'Puerta')+'</strong>'+
      '<span class="revision-puerta-tipo">'+_esc(window.TiposPuerta.nombre(p.tipo)||'—')+' · cada '+per+' meses</span>'+
      '<div class="revision-puerta-fecha">Última: '+_fmt(p.ultimaRevision)+' · Próxima: '+_fmt(p.proximaRevision)+'</div></div>'+
      '<span class="badge '+pb.clase+' badge-sm">'+pb.texto+'</span></div>';
  }).join('');
}

// ═══════════════════════════════════════════════════════════
//  PÁGINA: Revisiones
// ═══════════════════════════════════════════════════════════
window.render_revisionesCliente=async function(main){
  if(!main) main=document.getElementById('mainContent');
  main.innerHTML=
    '<div class="page-revisiones">'+
      '<div class="page-header"><div>'+
        '<h2 class="page-revisiones-title"><i class="fas fa-clipboard-list"></i> Revisiones</h2>'+
        '<p class="page-revisiones-subtitle">Clientes con mantenimiento contratado: próximas revisiones, historial y registro de nuevas revisiones.</p>'+
      '</div><div class="header-actions">'+
        '<button class="btn btn-primary" onclick="window.abrirNuevaRevision()"><i class="fas fa-plus"></i> Nueva revisión</button>'+
      '</div></div>'+
      '<div class="rev-search">'+
        '<input id="rev-q" class="input" type="search" placeholder="Buscar cliente, ruta o ubicación…" oninput="window.__revRefrescar()">'+
        '<input id="rev-fecha" class="input" type="date" onchange="window.__revRefrescar()" title="Filtrar por fecha">'+
        '<button class="btn btn-outline" onclick="window.__revLimpiarFiltro()" title="Limpiar filtros"><i class="fas fa-eraser"></i></button>'+
      '</div>'+
      '<div class="rev-tabs">'+
        '<button class="btn rev-tab active" id="rev-tab-proximas" onclick="window.__revTab(\'proximas\')"><i class="fas fa-calendar"></i> Próximas</button>'+
        '<button class="btn rev-tab" id="rev-tab-historial" onclick="window.__revTab(\'historial\')"><i class="fas fa-clock-rotate-left"></i> Historial</button>'+
      '</div>'+
      '<div id="rev-lista"></div>'+
    '</div>';
  window.__revEstado={tab:'proximas'};
  await window.__revRefrescar();
};
window.render_revisionesProgramadas=window.render_revisionesCliente;

window.__revLimpiarFiltro=function(){
  const q=document.getElementById('rev-q'), f=document.getElementById('rev-fecha');
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
  return {
    q:String(document.getElementById('rev-q')?.value||'').toLowerCase().trim(),
    fecha:String(document.getElementById('rev-fecha')?.value||'').slice(0,10)
  };
}
window.__revRefrescar=async function(){
  const cont=document.getElementById('rev-lista');
  if(!cont) return;
  cont.innerHTML='<p style="color:var(--gray);padding:12px;">Cargando…</p>';
  if(window.__revEstado.tab==='proximas') await window.__revPintarProximas(cont);
  else await window.__revPintarHistorial(cont);
};

// ── Pestaña PRÓXIMAS: una fila por cliente con mantenimiento ──
window.__revPintarProximas=async function(cont){
  const {q,fecha}=_filtros();
  let items=await C().getEstadoRevisiones();
  if(q) items=items.filter(i=>{
    const texto=[i.nombre,...i.rutas.map(r=>r.nombre),...i.ubicaciones.map(u=>u.denominacion)].join(' ').toLowerCase();
    return texto.includes(q);
  });
  if(fecha) items=items.filter(i=>String(i.proximaRevision||'').slice(0,10)===fecha);

  if(!items.length){
    cont.innerHTML='<div class="empty-state"><i class="fas fa-clipboard-check"></i><h3>Sin clientes con mantenimiento</h3><p>Marca «mantenimiento contratado» en la ficha de un cliente para que aparezca aquí.</p></div>';
    return;
  }
  cont.innerHTML=items.map(i=>filaHTML({
    icono:i.central?'fa-sitemap':'fa-user', titulo:i.nombre,
    detalle:i.central?plural(i.rutas.length,'ruta','rutas')+' · '+plural(i.ubicaciones.length,'ubicación','ubicaciones'):plural(i.puertas.length,'puerta','puertas'),
    fecha:i.proximaRevision, dataAttr:'data-cliente="'+_esc(i.id)+'" data-central="'+(i.central?1:0)+'"'
  })).join('');
  if(!cont.__delegado){
    cont.__delegado=true;
    cont.addEventListener('click',e=>{
      const fila=e.target.closest('[data-cliente]');
      if(!fila) return;
      const id=fila.getAttribute('data-cliente');
      if(fila.getAttribute('data-central')==='1') window.verRutasDeCliente(id); else window.verPuertasDeCliente(id);
    });
  }
};

async function _estadoDe(clienteId){
  const items=await C().getEstadoRevisiones();
  return items.find(i=>String(i.id)===String(clienteId))||null;
}

// ── VISTA: rutas de un cliente central ──
window.verRutasDeCliente=async function(clienteId){
  const main=document.getElementById('mainContent'); if(!main) return;
  const it=await _estadoDe(clienteId);
  if(!it){ showToast('Este cliente no tiene mantenimiento contratado','warning'); return window.render_revisionesCliente(main); }
  if(!it.central) return window.verPuertasDeCliente(clienteId);

  let borradores=[];
  try{ borradores=await C().Borradores.listar(clienteId); }catch(e){ /* sin borradores */ }
  const enCurso=rutaId=>borradores.find(b=>b.alcance==='R:'+rutaId);
  const filas=[...it.rutas].sort((a,b)=>String(a.proximaRevision||'9999').localeCompare(String(b.proximaRevision||'9999'))||String(a.nombre).localeCompare(String(b.nombre),'es')).map(r=>{
    const b=enCurso(r.id), rs=b&&b.resumen;
    return filaHTML({
      icono:'fa-route', titulo:r.nombre,
      detalle:plural(r.ubicaciones.length,'ubicación','ubicaciones')+(b?' · <strong style="color:#b45309">⏳ En curso'+(rs?' '+rs.hechas+'/'+rs.total:'')+'</strong>':''),
      fecha:r.proximaRevision, dataAttr:'data-ruta="'+_esc(r.id)+'"',
      botonRevisar:'<button class="btn btn-primary btn-sm" data-revisar-ruta="'+_esc(r.id)+'"><i class="fas fa-'+(b?'play':'clipboard-check')+'"></i> '+(b?'Continuar ruta':'Revisar ruta')+'</button>'});
  });
  if(it.sinRuta.length) filas.push(filaHTML({
      icono:'fa-location-dot', titulo:'Ubicaciones sin ruta', detalle:plural(it.sinRuta.length,'ubicación','ubicaciones'),
      fecha:C().minFecha(it.sinRuta.map(u=>u.proximaRevision)), dataAttr:'data-ruta="sin-ruta"'}));

  main.innerHTML='<div class="page-revisiones">'+cabecera({
      volver:true, icono:'fa-sitemap', titulo:it.nombre,
      subtitulo:plural(it.rutas.length,'ruta','rutas')+' · '+plural(it.ubicaciones.length,'ubicación','ubicaciones')+(it.proximaRevision?' · próxima el '+_fmt(it.proximaRevision):''),
      acciones:'<button class="btn btn-primary" data-accion="registrar"><i class="fas fa-clipboard-check"></i> Revisar central</button>'+
               '<button class="btn btn-outline" data-accion="pdf"><i class="fas fa-file-pdf"></i> PDF</button>'})+
    '<div id="rev-lista-rutas">'+(filas.join('')||'<div class="empty-state"><i class="fas fa-route"></i><h3>Sin rutas</h3><p>Crea rutas desde Clientes → '+_esc(it.nombre)+' → Rutas.</p></div>')+'</div></div>';

  main.querySelector('.page-header').addEventListener('click',e=>{
    if(e.target.closest('[data-volver]')) return window.render_revisionesCliente(main);
    const b=e.target.closest('[data-accion]'); if(!b) return;
    if(b.dataset.accion==='registrar') window.abrirFormularioRevision({clienteId,fecha:it.proximaRevision||hoyISO()});
    if(b.dataset.accion==='pdf') window.generatePDF_informeCliente(clienteId);
  });
  document.getElementById('rev-lista-rutas').addEventListener('click',e=>{
    const rb=e.target.closest('[data-revisar-ruta]');
    if(rb){ e.stopPropagation(); const r=it.rutas.find(x=>String(x.id)===rb.getAttribute('data-revisar-ruta'));
      return window.abrirFormularioRevision({clienteId,rutaId:rb.getAttribute('data-revisar-ruta'),fecha:(r&&r.proximaRevision)||hoyISO()}); }
    const f=e.target.closest('[data-ruta]'); if(f) window.verUbicacionesDeRuta(clienteId,f.getAttribute('data-ruta'));
  });
};

// ── VISTA: ubicaciones de una ruta (o de las que no tienen ruta) ──
window.verUbicacionesDeRuta=async function(clienteId, rutaId){
  const main=document.getElementById('mainContent'); if(!main) return;
  const it=await _estadoDe(clienteId);
  if(!it) return window.render_revisionesCliente(main);
  const sinRuta=rutaId==='sin-ruta';
  const ruta=sinRuta?null:it.rutas.find(r=>String(r.id)===String(rutaId));
  if(!sinRuta && !ruta){ showToast('No se encontró la ruta','error'); return window.verRutasDeCliente(clienteId); }
  const ubics=sinRuta?it.sinRuta:ruta.ubicaciones;
  const proxima=C().minFecha(ubics.map(u=>u.proximaRevision));
  const nombre=sinRuta?'Ubicaciones sin ruta':ruta.nombre;

  main.innerHTML='<div class="page-revisiones">'+cabecera({
      volver:true, icono:sinRuta?'fa-location-dot':'fa-route', titulo:nombre,
      subtitulo:_esc(it.nombre)+' · '+plural(ubics.length,'ubicación','ubicaciones')+(proxima?' · próxima el '+_fmt(proxima):''),
      acciones:(window.isAdmin?.()&&!sinRuta?'<button class="btn btn-outline" data-accion="optimizar"><i class="fas fa-wand-magic-sparkles"></i> Ordenar ruta</button>':'')+
               '<button class="btn btn-primary" data-accion="registrar"><i class="fas fa-clipboard-check"></i> Revisar '+(sinRuta?'ubicaciones':'ruta')+'</button>'+
               '<button class="btn btn-outline" data-accion="pdf"><i class="fas fa-file-pdf"></i> PDF</button>'})+
    '<div id="rev-lista-ubicaciones"></div></div>';

  const cont=document.getElementById('rev-lista-ubicaciones');
  cont.innerHTML=ubics.length?ubics.map((u,i)=>{
    const b=_badge(u.proximaRevision);
    return '<div class="rev-tienda-bloque"><div class="rev-tienda-cab"><strong><i class="fas fa-warehouse"></i> '+(sinRuta?'':(i+1)+'. ')+_esc(u.denominacion)+'</strong>'+
      '<span><span class="badge '+(u.puertas.length?b.clase:'badge-yellow')+' badge-sm">'+(u.puertas.length?b.texto:'Sin puertas')+'</span> '+
      '<button class="btn btn-outline btn-sm" data-maps="'+_esc(u.direccion||'')+'" title="Abrir en Maps"><i class="fas fa-map-marker-alt"></i></button> '+
      '<button class="btn btn-primary btn-sm" data-revisar-ubic="'+_esc(u.id)+'"><i class="fas fa-clipboard-check"></i> Revisar</button></span></div>'+
      (u.direccion?'<div class="revision-puerta-fecha" style="padding:0 14px 6px">'+_esc(u.direccion)+'</div>':'')+
      '<div class="rev-tienda-puertas">'+bloquePuertas(u.puertas)+'</div></div>';
  }).join(''):'<div class="empty-state"><i class="fas fa-warehouse"></i><h3>Sin ubicaciones</h3><p>Esta ruta no tiene ubicaciones asignadas.</p></div>';

  main.querySelector('.page-header').addEventListener('click',e=>{
    if(e.target.closest('[data-volver]')) return window.verRutasDeCliente(clienteId);
    const b=e.target.closest('[data-accion]'); if(!b) return;
    if(b.dataset.accion==='registrar') window.abrirFormularioRevision({clienteId,rutaId:sinRuta?null:rutaId,ubicacionIds:ubics.map(u=>u.id),fecha:proxima||hoyISO()});
    if(b.dataset.accion==='pdf') window.generatePDF_informeCliente(clienteId,{rutaId:sinRuta?'sin-ruta':rutaId});
    if(b.dataset.accion==='optimizar') C().optimizarRuta(rutaId,clienteId);
  });
  cont.addEventListener('click',e=>{
    const m=e.target.closest('[data-maps]');
    if(m){ window.abrirGoogleMaps(m.getAttribute('data-maps')); return; }
    const r=e.target.closest('[data-revisar-ubic]');
    if(r) window.abrirFormularioRevision({clienteId,rutaId:sinRuta?null:rutaId,ubicacionIds:[r.getAttribute('data-revisar-ubic')],fecha:hoyISO()});
  });
};

// ── VISTA: puertas de un cliente individual ──
window.verPuertasDeCliente=async function(clienteId){
  const main=document.getElementById('mainContent'); if(!main) return;
  const it=await _estadoDe(clienteId);
  if(!it){ showToast('Este cliente no tiene mantenimiento contratado','warning'); return window.render_revisionesCliente(main); }
  if(it.central) return window.verRutasDeCliente(clienteId);

  main.innerHTML='<div class="page-revisiones">'+cabecera({
      volver:true, icono:'fa-user', titulo:it.nombre,
      subtitulo:plural(it.puertas.length,'puerta','puertas')+(it.proximaRevision?' · próxima el '+_fmt(it.proximaRevision):''),
      acciones:'<button class="btn btn-primary" data-accion="registrar"><i class="fas fa-clipboard-check"></i> Registrar revisión</button>'+
               '<button class="btn btn-outline" data-accion="pdf"><i class="fas fa-file-pdf"></i> PDF</button>'})+
    '<div id="rev-lista-puertas">'+(it.puertas.length?bloquePuertas(it.puertas):'<div class="empty-state"><i class="fas fa-door-open"></i><h3>Sin puertas</h3><p>Añade las puertas desde Clientes → '+_esc(it.nombre)+' → Puertas.</p></div>')+'</div></div>';

  main.querySelector('.page-header').addEventListener('click',e=>{
    if(e.target.closest('[data-volver]')) return window.render_revisionesCliente(main);
    const b=e.target.closest('[data-accion]'); if(!b) return;
    if(b.dataset.accion==='registrar') window.abrirFormularioRevision({clienteId,fecha:it.proximaRevision||hoyISO()});
    if(b.dataset.accion==='pdf') window.generatePDF_informeCliente(clienteId);
  });
};

// ── Pestaña HISTORIAL ──
window.__revPintarHistorial=async function(cont){
  const {q,fecha}=_filtros();
  const [revisiones,clientes]=await Promise.all([dbGetAll('revisiones'),dbGetAll('clientes')]);
  const clientNames=new Map(clientes.map(c=>[String(c.id),c.nombre]));
  const meta=r=>window.revisionHistoryMetadata?window.revisionHistoryMetadata(r):{clientNames:[],technician:'',chainName:''};
  let filas=revisiones.map(r=>({r,m:meta(r)}));
  const nombreDe=({r,m})=>m.clientName||m.chainName||clientNames.get(String(r.clienteId||m.clientId||''))||m.clientNames.join(', ')||'—';
  if(q) filas=filas.filter(x=>{
    const ubic=(x.r.items||[]).map(i=>i.ubicacionNombre||'').join(' ');
    return (nombreDe(x)+' '+ubic+' '+(x.m.rutaNombre||'')).toLowerCase().includes(q)||String(x.r.id).toLowerCase().includes(q);
  });
  if(fecha) filas=filas.filter(({r})=>String(r.fecha||'').slice(0,10)===fecha);
  filas.sort((a,b)=>String(b.r.fecha||'').localeCompare(String(a.r.fecha||'')));

  if(!filas.length){
    cont.innerHTML='<div class="empty-state"><i class="fas fa-inbox"></i><h3>Sin revisiones</h3><p>No hay revisiones registradas que coincidan con la búsqueda.</p></div>';
    return;
  }
  cont.innerHTML='<div class="table-wrapper"><table><thead><tr><th>Fecha</th><th>Cliente</th><th>Ruta / ubicaciones</th><th>Técnico</th><th>Puertas</th><th>Resultado</th><th></th></tr></thead><tbody>'+
    filas.map(x=>{
      const {r,m}=x;
      const ubics=[...new Set((r.items||[]).map(i=>i.ubicacionNombre).filter(Boolean))];
      const crudo=r.estadoTrasRevision||((r.items||[]).some(i=>i.resultadoEstado==='x')?'Fuera de servicio':'Operativa');
      const res=String(crudo).replace(/_/g,' ');
      return '<tr><td>'+_esc(_fmt(r.fecha))+'</td><td>'+_esc(nombreDe(x))+'</td>'+
        '<td>'+_esc([m.rutaNombre,ubics.length>3?ubics.length+' ubicaciones':ubics.join(', ')].filter(Boolean).join(' · ')||'—')+'</td>'+
        '<td>'+_esc(m.technician||'—')+'</td><td>'+(r.items||[]).length+'</td><td>'+_esc(res.charAt(0).toUpperCase()+res.slice(1))+'</td>'+
        '<td><button class="btn btn-outline btn-sm" data-accion="pdf-rev" data-id="'+_esc(r.id)+'"><i class="fas fa-file-pdf"></i></button></td></tr>';
    }).join('')+'</tbody></table></div>';
  if(!cont.__delegadoHist){
    cont.__delegadoHist=true;
    cont.addEventListener('click',e=>{
      const btn=e.target.closest('button[data-accion="pdf-rev"]');
      if(btn) window.generatePDF_revision(btn.getAttribute('data-id'));
    });
  }
};

// ═══════════════════════════════════════════════════════════
//  NUEVA REVISIÓN — cliente (con mantenimiento) y alcance
// ═══════════════════════════════════════════════════════════
window.abrirNuevaRevision=async function(clientePreseleccionado){
  const items=await C().getEstadoRevisiones();
  if(!items.length){ showToast('Ningún cliente tiene mantenimiento contratado todavía','warning'); return; }
  window.__nrItems=items;
  const op=l=>l.map(c=>'<option value="'+_esc(c.id)+'">'+_esc(c.nombre)+'</option>').join('');
  const body='<div class="form-grid">'+
    '<div class="form-group"><label>Cliente *</label><select id="nr-cliente" class="input" onchange="window.__nrAlcance()">'+
      '<option value="">— Seleccionar —</option>'+
      (items.some(i=>i.central)?'<optgroup label="Centrales (varias ubicaciones)">'+op(items.filter(i=>i.central))+'</optgroup>':'')+
      (items.some(i=>!i.central)?'<optgroup label="Individuales">'+op(items.filter(i=>!i.central))+'</optgroup>':'')+
    '</select></div>'+
    '<div class="form-group" id="nr-alcance-g" style="display:none"><label>Qué revisar</label><select id="nr-alcance" class="input"></select></div>'+
    '<div class="form-group"><label>Fecha de revisión *</label><input id="nr-fecha" type="date" class="input" value="'+hoyISO()+'"></div>'+
    '<p style="color:var(--text-muted);font-size:13px;margin:0;">Se abrirá el formulario con las puertas del alcance elegido.</p></div>';
  openModal('Nueva revisión',body,
    '<button class="btn btn-outline" onclick="cerrarFormularioRevision()">Cerrar</button>'+
    '<button class="btn btn-primary" onclick="window.__revIniciar()"><i class="fas fa-arrow-right"></i> Continuar</button>');
  if(clientePreseleccionado){ document.getElementById('nr-cliente').value=clientePreseleccionado; window.__nrAlcance(); }
};

window.__nrAlcance=function(){
  const id=document.getElementById('nr-cliente').value;
  const it=(window.__nrItems||[]).find(i=>String(i.id)===String(id));
  const g=document.getElementById('nr-alcance-g'), sel=document.getElementById('nr-alcance');
  if(!it||!it.central){ g.style.display='none'; sel.innerHTML=''; return; }
  g.style.display='';
  sel.innerHTML='<option value="todo">Toda la central ('+it.ubicaciones.length+' ubicaciones)</option>'+
    (it.rutas.length?'<optgroup label="Una ruta">'+it.rutas.map(r=>'<option value="R:'+_esc(r.id)+'">'+_esc(r.nombre)+' ('+r.ubicaciones.length+')</option>').join('')+'</optgroup>':'')+
    (it.ubicaciones.length?'<optgroup label="Una ubicación">'+it.ubicaciones.map(u=>'<option value="U:'+_esc(u.id)+'">'+_esc(u.denominacion)+'</option>').join('')+'</optgroup>':'');
};

window.__revIniciar=async function(){
  const clienteId=document.getElementById('nr-cliente').value;
  const fecha=document.getElementById('nr-fecha').value;
  if(!clienteId) return showToast('Selecciona un cliente','error');
  if(!fecha) return showToast('Selecciona la fecha de revisión','error');
  const alcance=document.getElementById('nr-alcance')?.value||'todo';
  closeModal();
  const opts={clienteId,fecha};
  if(alcance.startsWith('R:')) opts.rutaId=alcance.slice(2);
  if(alcance.startsWith('U:')) opts.ubicacionIds=[alcance.slice(2)];
  return window.abrirFormularioRevision(opts);
};

// ═══════════════════════════════════════════════════════════
//  PDF — informe de estado de revisiones
//  opts.rutaId: una ruta concreta ('sin-ruta' = ubicaciones sin ruta)
// ═══════════════════════════════════════════════════════════
window.generatePDF_informeCliente=async function(clienteId, opts){
  opts=opts||{};
  await window.ensurePdfLibs?.();
  const it=await _estadoDe(clienteId);
  if(!it){ showToast('Este cliente no tiene mantenimiento contratado','warning'); return; }
  const doc=await createBrandedPDF('Informe de Revisiones','Estado de revisiones');
  const lineas=[];
  const puertaLinea=p=>['      · '+(p.nombre||'Puerta')+' ('+(window.TiposPuerta.nombre(p.tipo)||'—')+') · cada '+window.Periodicidad.frecuenciaMeses(p)+' m', _fmt(p.proximaRevision)];
  const ubicLinea=u=>{ lineas.push(['   UBICACIÓN: '+u.denominacion+(u.direccion?' — '+u.direccion:''), '']); u.puertas.forEach(p=>lineas.push(puertaLinea(p))); };

  lineas.push(['Cliente', it.nombre]);
  lineas.push(['Próxima revisión', it.proximaRevision?_fmt(it.proximaRevision):'Sin programar']);
  lineas.push(['Estado', _badge(it.proximaRevision).texto]);
  if(it.central){
    const rutas=opts.rutaId?(opts.rutaId==='sin-ruta'?[]:it.rutas.filter(r=>String(r.id)===String(opts.rutaId))):it.rutas;
    for(const r of rutas){
      lineas.push(['RUTA: '+r.nombre+' ('+plural(r.ubicaciones.length,'ubicación','ubicaciones')+')', r.proximaRevision?_fmt(r.proximaRevision):'Sin programar']);
      r.ubicaciones.forEach(ubicLinea);
    }
    if(!opts.rutaId||opts.rutaId==='sin-ruta'){
      if(it.sinRuta.length){ lineas.push(['UBICACIONES SIN RUTA','']); it.sinRuta.forEach(ubicLinea); }
    }
  }else{
    lineas.push(['Puertas registradas', String(it.puertas.length)]);
    it.puertas.forEach(p=>lineas.push(puertaLinea(p)));
  }
  doc.autoTable(pdfTableStyle({startY:38,head:[['Concepto','Detalle / fecha']],body:lineas,
    headStyles:{fillColor:PDF_BRAND.primary,textColor:255,fontSize:8,fontStyle:'bold',cellPadding:3},
    bodyStyles:{fontSize:8,cellPadding:2.5,textColor:PDF_BRAND.text}}));
  addPDFFootersAllPages(doc);
  doc.save('revisiones_'+String(it.nombre).replace(/[^a-zA-Z0-9_-]/g,'_')+'_'+hoyISO()+'.pdf');
  showToast('Informe de revisiones generado');
};

})();
