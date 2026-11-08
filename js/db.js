/**
 * db.js v11 — Supabase + caché IndexedDB (offline-first)
 * AutoPuerta Pro
 *
 * Cambios vs v10.2:
 *  - KEY leída de window.SUPABASE_CONFIG (definido en index.html)
 *  - TABLA.partesTrabajo → 'partes_trabajo' (esquema usado por los formularios)
 *  - REN_OUT/REN_IN ampliados: puertaIds, clienteId, tipoPuerta, kmInicial
 *  - REN_IN errata corregida: 'precocompra' → 'precocompra' (columna real en BD es precocompra)
 *  - dbGetAll: reintento sin .order('createdat') si la tabla no tiene la columna
 *  - dbAdd/dbPut: generan id automático si falta (partes venían de autoIncrement)
 *  - seedIfEmpty: protegido con flag localStorage 'autopuerta_seed_hecho'
 *  - Caché IndexedDB real para lectura offline
 *  - window.db expuesto con todas las funciones
 */

// ── Config (definir window.SUPABASE_CONFIG en index.html) ─────
const SUPABASE_URL = (window.SUPABASE_CONFIG || {}).url || 'https://ziimllianelsocrdeeut.supabase.co';
const SUPABASE_KEY = (window.SUPABASE_CONFIG || {}).anon || '';

if (!SUPABASE_KEY.startsWith('eyJ')) {
  console.error('[db.js] ❌ Falta anon key válida. Define window.SUPABASE_CONFIG en index.html.');
}

const supabaseDB = window.sb || window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
window.supabaseDB = supabaseDB;

// ── Mapping store → tabla real ─────────────────────────────
const TABLA = {
  clientes:      'clientes',
  presupuestos:  'presupuestos',
  vehiculos:     'vehiculos',
  almacen:       'almacen',
  tiposPuerta:   'tipos_puerta',
  empleados:     'empleados',
  ubicaciones:   'ubicaciones',
  informes:      'informes',
  puertas:       'puertas',
  revisiones:    'revisiones',
  partesTrabajo: 'partes_trabajo',
  albaranes: 'albaranes',
  rutas:         'rutas',
  articulos:     'articulos',
  jornadas:      'jornadas',
  tableros:      'tableros',
  tarjetasTablero: 'tarjetas_tablero',
  solicitudesMaterial: 'solicitudes_material',
  incidencias: 'incidencias',
  manuales:      'manuales',
  plantillasRevisiones: 'plantillas_revisiones',
  proveedores:   'proveedores',
  entradasMaterial: 'entradas_material',
  almacenAlias:  'almacen_alias'
};

// ── Renombrado camelCase ↔ snake_case ──────────────────────
const REN_OUT = {
  updatedAt:'updatedat',
  createdAt:'createdat',
  empleadoId:'empleadoid',
  empleadoNombre:'empleadonombre',
  empleadoDni:'empleadodni',
  clienteDni:'clientedni',
  firmaTecnico:'firmatecnico',
  firmaCliente:'firmacliente',
  horaEntrada:'hora_entrada',
  horaSalida:'hora_salida',
  vehiculoId:'vehiculoid',
  ubicacionNombre:'ubicacionnombre',
  ubicacionDireccion:'ubicaciondireccion',
  precioCompra:'preciocompra',
  precioVenta:'precioventa',
  stockMinimo:'stockminimo',
  puertaIds:'puertaids',
  puertasDetalle:'puertasdetalle',
  clienteId:'clienteid',
  tecnicoId:'tecnicoid',
  clienteNombre:'clientenombre',
  tipoPuerta:'tipopuerta',
  kmInicial:'km_inicial',
  puertaId:'puertaid',
  numeroSerie:'numeroserie',
  boardId:'boardid',
  dueDate:'fechalimite',
  assigneeId:'asignadoid',
  order:'orden',
  ubicacionId:'ubicacionid',
  matriculaAsociada:'matriculaasociada',
  medidasAncho:'medidasancho',
  medidasAlto:'medidasalto',
  anioInstalacion:'anioinstalacion',
  fechaRevision:'fecharevision',
  ultimaRevision:'ultimorevision',
  frecuenciaMeses:'frecuenciameses',
  proximaRevision:'proximarevision',
  estadoTrasRevision:'estadotrasrevision',
  resultadoRev:'resultado',
  observacionesRev:'observaciones',
  // Puertas: periodicidad por uso/criterio · ubicaciones
  nVehiculos:'nvehiculos',
  usoEstacional:'usoestacional',
  ciclosDia:'ciclosdia',
  clienteOrigenId:'clienteorigenid',
  // Clientes (esCadena/padreId/cadenaId: campos antiguos, la app ya no los escribe)
  esCadena:'escadena',
  padreId:'padreid',
  cadenaId:'cadenaid',
  rutaId:'rutaid',
  ordenRuta:'ordenruta',
  createdBy:'createdby',
  articuloId:'articuloid',
  presupuestoId:'presupuestoid',
  parteId:'parteid',
  medidasPlanta:'medidasplanta',
  employeeId:'employee_id',
  notaTecnico:'notatecnico',
  resueltaAt:'resueltaat',
  validoHasta:'validohasta',
  fotosAlbaran:'fotosalbaran',
  lineItems:'lineitems',
  emailSecundario:'emailsecundario',
  selloCliente:'sellocliente',
  motivoInterno:'motivointerno',
  internoOrigen:'internoorigen',
  internoDestino:'internodestino',
  // Clientes (Sage + geolocalización)
  sageCodigo:'sagecodigo',
  sageDatos:'sagedatos',
  // Artículos de Sage
  codigoAlt:'codigoalt',
  codFamilia:'codfamilia',
  fechaBaja:'fechabaja',
  controlStock:'controlstock',
  sageStock:'sagestock',
  sageSyncAt:'sagesyncat',
  tecnicoIds:'tecnicoids',
  clienteDireccion:'clientedireccion',
  clienteTelefono:'clientetelefono',
  clienteDocumento:'clientedocumento',
  firmadoAt:'firmadoat'
};
const REN_IN = {
  updatedat:'updatedAt',
  createdat:'createdAt',
  empleadoid:'empleadoId',
  empleadonombre:'empleadoNombre',
  empleadodni:'empleadoDni',
  clientedni:'clienteDni',
  firmatecnico:'firmaTecnico',
  firmacliente:'firmaCliente',
  hora_entrada:'horaEntrada',
  hora_salida:'horaSalida',
  vehiculoid:'vehiculoId',
  ubicacionnombre:'ubicacionNombre',
  ubicaciondireccion:'ubicacionDireccion',
  preciocompra:'precioCompra',
  precioventa:'precioVenta',
  stockminimo:'stockMinimo',
  puertaids:'puertaIds',
  puertasdetalle:'puertasDetalle',
  clienteid:'clienteId',
  clientenombre:'clienteNombre',
  tipopuerta:'tipoPuerta',
  km_inicial:'kmInicial',
  puertaid:'puertaId',
  numeroserie:'numeroSerie',
  boardid:'boardId',
  fechalimite:'dueDate',
  asignadoid:'assigneeId',
  orden:'order',
  ubicacionid:'ubicacionId',
  matriculaasociada:'matriculaAsociada',
  medidasancho:'medidasAncho',
  medidasalto:'medidasAlto',
  anioinstalacion:'anioInstalacion',
  fecharevision:'fechaRevision',
  ultimorevision:'ultimaRevision',
  frecuenciameses:'frecuenciaMeses',
  proximarevision:'proximaRevision',
  estadotrasrevision:'estadoTrasRevision',
  resultado:'resultadoRev',
  observaciones:'observacionesRev',
 nvehiculos:'nVehiculos',
  usoestacional:'usoEstacional',
  ciclosdia:'ciclosDia',
  clienteorigenid:'clienteOrigenId',
 escadena:'esCadena',
  padreid:'padreId',
  cadenaid:'cadenaId',
  rutaid:'rutaId',
  ordenruta:'ordenRuta',
  createdby:'createdBy',
  articuloid:'articuloId',
  presupuestoid:'presupuestoId',
  parteid:'parteId',
  medidasplanta:'medidasPlanta',
  employee_id:'employeeId',
  notatecnico:'notaTecnico',
  resueltaat:'resueltaAt',
  validohasta:'validoHasta',
  fotosalbaran:'fotosAlbaran',
  lineitems:'lineItems',
  emailsecundario:'emailSecundario',
  sellocliente:'selloCliente',
  motivointerno:'motivoInterno',
  internoorigen:'internoOrigen',
  internodestino:'internoDestino',
  // Clientes
  sagecodigo:'sageCodigo',
  sagedatos:'sageDatos',
  tecnicoids:'tecnicoIds',
  clientedireccion:'clienteDireccion',
  clientetelefono:'clienteTelefono',
  clientedocumento:'clienteDocumento',
  firmadoat:'firmadoAt'
};

// El mapeo de lectura se completa con todo lo que se escribe: un campo añadido solo a REN_OUT
// (p. ej. tecnicoId) ya no vuelve de la base de datos con otro nombre.
for(const[camel,col]of Object.entries(REN_OUT)){ if(!(col in REN_IN)) REN_IN[col]=camel; }
const _unmappedWarned=new Set();

function toDB(obj){
  if(!obj || typeof obj!=='object') return obj;
  const o={};
  for(const[k,v]of Object.entries(obj)){
    // Las columnas son minúsculas: una clave con mayúsculas sin entrada en REN_OUT fallará en Supabase
    if(REN_OUT[k]===undefined && /[A-Z]/.test(k) && !_unmappedWarned.has(k)){
      _unmappedWarned.add(k);
      console.warn('[db] El campo "'+k+'" no está en REN_OUT; Supabase lo rechazará. Añádelo (camelCase → minúsculas).');
    }
    o[REN_OUT[k]||k]=v;
  }
  o.updatedat=new Date().toISOString();
  return o;
}

function fromJS(obj){
  if(!obj || typeof obj!=='object') return obj;
  const o={};
  for(const[k,v]of Object.entries(obj)){
    o[REN_IN[k]||k]=v;
  }
  return o;
}

function fromJSArray(rows){
  return Array.isArray(rows) ? rows.map(fromJS) : rows;
}

// ── Generador de IDs legibles ──────────────────────────────
function nextId(prefix){
  return prefix + '-' + Date.now().toString(36).toUpperCase() + Math.random().toString(36).slice(2,5).toUpperCase();
}

// ── Caché IndexedDB (lectura offline) ──────────────────────
const CACHE_DB='autopuerta_cache', CACHE_STORE='cache', TTL=5*60_000, BG_REFRESH_AFTER=60_000;
let _cdb=null;

function openCache(){
  return new Promise((res,rej)=>{
    if(_cdb) return res(_cdb);
    const r=indexedDB.open(CACHE_DB,1);
    r.onupgradeneeded=e=>e.target.result.createObjectStore(CACHE_STORE);
    r.onsuccess=e=>{_cdb=e.target.result;res(_cdb);};
    r.onerror=e=>{rej(r.error);};
  });
}

async function cacheReadEntry(store){
  try{
    const db=await openCache();
    return await new Promise(res=>{
      const rq=db.transaction(CACHE_STORE).objectStore(CACHE_STORE).get(store);
      rq.onsuccess=()=>res(rq.result||null);
      rq.onerror=()=>res(null);
    });
  }catch(e){ return null; }
}

async function cacheRead(store,allowStale=false){
  const entry=await cacheReadEntry(store);
  if(!entry || entry.data===null) return null;
  if(!allowStale && (entry.complete===false || Date.now()-entry.ts>=TTL)) return null;
  return entry.data;
}

async function cacheWrite(store,data,complete=data!==null){
  try{
    const db=await openCache();
    const tx=db.transaction(CACHE_STORE,'readwrite');
    tx.objectStore(CACHE_STORE).put({data,ts:Date.now(),complete},store);
    return new Promise(res=>{tx.oncomplete=()=>res(true);tx.onerror=()=>res(false);});
  }catch(e){ return false; }
}

async function cacheInvalidate(store){
  _storeVersion[store]=(_storeVersion[store]||0)+1;
  const entry=await cacheReadEntry(store);
  const db=await openCache();
  const tx=db.transaction(CACHE_STORE,'readwrite');
  tx.objectStore(CACHE_STORE).put({data:entry?.data??[],ts:0,complete:false},store);
  return new Promise(res=>{tx.oncomplete=()=>res(true);tx.onerror=()=>res(false);});
}

async function cacheUpdateStore(store,update){
  const entry=await cacheReadEntry(store);
  const rows=Array.isArray(entry?.data)?entry.data:[];
  const next=update(rows);
  await cacheWrite(store,next,entry ? entry.complete!==false : false);
}

function isNetworkError(error){
  const message=String(error?.message||error||'').toLowerCase();
  return !navigator.onLine || error instanceof TypeError || /fetch|network|timeout|timed out|connection|offline|abort/.test(message);
}

function queueRecordId(item){
  if(item.recordId!==undefined && item.recordId!==null) return String(item.recordId);
  if(item.action==='delete'){
    const id=String(item.id||'');
    return id.startsWith('SYNC-') ? null : id;
  }
  return item.data?.id===undefined ? null : String(item.data.id);
}

const SYNC_FAILED_KEY='autopuerta_sync_failed';
function currentOwnerId(){ return window.authState?.user?.id||null; }
// Cada usuario solo ve y sincroniza sus operaciones pendientes (las de otro se conservan intactas)
function isOwnQueueItem(item){ const me=currentOwnerId(); return !item.ownerId || !me || item.ownerId===me; }

function readSyncQueue(){
  try{
    const queue=JSON.parse(localStorage.getItem('autopuerta_sync_queue')||'[]');
    return Array.isArray(queue) ? queue : [];
  }catch(e){ return []; }
}

function readSyncFailed(){
  try{
    const list=JSON.parse(localStorage.getItem(SYNC_FAILED_KEY)||'[]');
    return Array.isArray(list) ? list : [];
  }catch(e){ return []; }
}

function writeSyncFailed(list){
  try{ localStorage.setItem(SYNC_FAILED_KEY,JSON.stringify(list)); }
  catch(e){ console.warn('[SyncQueue] no se pudo guardar la lista de operaciones fallidas:',e.message); }
}

function syncCounts(){
  return {pending:readSyncQueue().filter(isOwnQueueItem).length, failed:readSyncFailed().filter(isOwnQueueItem).length};
}

function emitSyncState(){
  window.dispatchEvent(new CustomEvent('autopuerta:sync-state',{detail:{...syncCounts(),online:navigator.onLine}}));
}

function writeSyncQueue(queue){
  try{ localStorage.setItem('autopuerta_sync_queue',JSON.stringify(queue)); }
  catch(e){ throw new Error('No hay espacio en el móvil para guardar los cambios pendientes de enviar'); }
  emitSyncState();
}

async function enqueueSyncOperation(item){
  const recordId=item.action==='delete' ? String(item.id) : queueRecordId(item);
  const entry={...item,recordId,ts:Date.now(),editedAt:new Date().toISOString(),attempts:0,ownerId:currentOwnerId(),
    queueId:'SYNC-'+Date.now()+'-'+Math.random().toString(36).slice(2,8)};
  const queue=readSyncQueue().filter(pending=>{
    // Una operación nueva sustituye a la pendiente del mismo registro, pero solo si es del mismo usuario
    return !(pending.store===entry.store && recordId!==null && queueRecordId(pending)===recordId && isOwnQueueItem(pending));
  });
  queue.push(entry);
  writeSyncQueue(queue);
  if(navigator.onLine) setTimeout(()=>flushSyncQueue(),0);
  return entry;
}

async function cacheApplyPending(store,rows){
  const queue=await dbSyncQueueGetPending();
  return queue.filter(item=>item.store===store).reduce((result,item)=>{
    const id=queueRecordId(item);
    if(id===null) return result;
    const index=result.findIndex(record=>String(record.id)===id);
    if(item.action==='delete'){
      if(index!==-1) result.splice(index,1);
    }else if(item.data){
      const record={...item.data,id:item.data.id||id};
      if(index===-1) result.push(record);
      else result[index]=record;
    }
    return result;
  },Array.isArray(rows)?rows.slice():[]);
}

// ── Helpers CRUD ──────────────────────────────────────────
async function openDB(){ return supabaseDB; }

function rejectAuthenticatedOfflineWrite(){
  if(window.authState?.user && !navigator.onLine){
    throw new Error('Esta acción requiere conexión para proteger los permisos de la cuenta.');
  }
}

window.dbGetTechnicianEmployee=async function(){
  const {data,error}=await supabaseDB.rpc('get_my_employee');
  if(error) throw error;
  return data;
};

window.clearAuthenticatedCache=async function(){
  for(const store of Object.keys(TABLA)) await cacheWrite(store,[],false);
  // La cola de envíos pendientes NO se borra: pertenece a cada usuario (ownerId) y se enviará cuando vuelva a entrar.
  // Borrarla aquí perdía en silencio el trabajo hecho sin conexión si la sesión caducaba.
};

async function dbAdd(store,data){
  rejectAuthenticatedOfflineWrite();
  if(store==='partesTrabajo' && !navigator.onLine){
    throw new Error('Para crear un parte hace falta conexión; Supabase debe asignarle su ID.');
  }
  const tableName=TABLA[store]||store;
  const input={...data};
  delete input._light; delete input.fotosurls; delete input.fotoscount; // campos solo del listado ligero
  if(['partesTrabajo','revisiones','solicitudesMaterial'].includes(store) && window.authState?.user && !Object.prototype.hasOwnProperty.call(input,'createdBy')){
    input.createdBy=window.authState.user.id;
  }
  const obj=toDB(input);
  if(!obj.id && store !== 'partesTrabajo'){
    const pref=(store==='partesTrabajo'?'PARTE':store.slice(0,3).toUpperCase());
    obj.id=nextId(pref);
  }
  const local=fromJS(obj);
  if(!navigator.onLine){
    await cacheUpdateStore(store,rows=>{rows.push(local);return rows;});
    await enqueueSyncOperation({action:'put',store,data:local});
    return local;
  }
  try{
    const insertQuery=supabaseDB.from(tableName).insert(obj);
    const {data:result,error}=await (store==='partesTrabajo'
      ? insertQuery.select('id').maybeSingle()
      : insertQuery.select().maybeSingle());
    if(error) {
      if(String(error.code || '').toUpperCase() === 'PGRST116') return local;
      throw error;
    }
    const saved = result ? fromJS({...obj,...result}) : local;
    await cacheUpdateStore(store,rows=>{rows.push(saved);return rows;});
    return saved;
  }catch(error){
    if(!isNetworkError(error) && String(error?.code || '').toUpperCase() !== 'PGRST116') throw error;
    if(window.authState?.user) throw error;
    await cacheUpdateStore(store,rows=>{rows.push(local);return rows;});
    await enqueueSyncOperation({action:'put',store,data:local});
    return local;
  }
}

async function dbCreate(store,data){ return dbAdd(store,data); }

// ── Merge inteligente para partes de trabajo ─────────────────────────────
function mergePartesTrabajo(serverRecord, localRecord){
  // Campos que se priorizan del servidor (no se sobrescriben)
  const serverPriority=['id','createdAt','createdBy','updatedat'];
  // Campos que se priorizan del local (última edición del usuario)
  const localPriority=['estado','notas','ubicacionId','ubicacionNombre','ubicacionDireccion','kmInicial','kmFinal','horaEntrada','horaSalida','fotos','materiales'];
  // Campos que se combinan (arrays)
  const mergeFields=['puertaIds'];
  
  const merged={...serverRecord};
  
  // Aplicar campos con prioridad local
  for(const field of localPriority){
    if(localRecord[field]!==undefined && localRecord[field]!==null){
      merged[field]=localRecord[field];
    }
  }
  
  // Combinar arrays
  for(const field of mergeFields){
    const serverArr=Array.isArray(serverRecord[field])?serverRecord[field]:[];
    const localArr=Array.isArray(localRecord[field])?localRecord[field]:[];
    // Unir arrays eliminando duplicados
    merged[field]=[...new Set([...serverArr,...localArr])];
  }
  
  // Mantener updatedAt más reciente
  const serverTime=serverRecord.updatedat?new Date(serverRecord.updatedat).getTime():0;
  const localTime=localRecord.updatedAt?new Date(localRecord.updatedAt).getTime():0;
  merged.updatedAt=localTime>serverTime?localRecord.updatedAt:serverRecord.updatedat;
  
  return merged;
}

// ── Guardado sin pisar cambios ajenos ─────────────────────────────────────
// Antes: upsert del registro completo (last-write-wins: se perdía lo que otro había editado en OTROS campos).
// Ahora: UPDATE solo de los campos que cambió este usuario, con bloqueo optimista por updatedat; si otro usuario
// editó mientras tanto, se fusiona campo a campo (los contadores como el stock suman la diferencia).
const PUT_IGNORE=['id','updatedAt','updatedat','createdAt','createdat','createdBy','createdby','_light'];
const PUT_DELTA_FIELDS={almacen:['stock']};

function reportPutConflicts(store,id,conflicts){
  console.warn('[db] Edición simultánea en',store,id,conflicts);
  try{ window.dispatchEvent(new CustomEvent('autopuerta:conflict',{detail:{store,id,conflicts}})); }catch(e){}
  const pisados=conflicts.filter(c=>c.kind==='overwrite').map(c=>c.field);
  if(pisados.length && window.showToast){
    window.showToast('Otro usuario había modificado también: '+pisados.join(', ')+'. Se ha guardado tu versión.','warning');
  }
}

async function putMerging(store,tableName,input,obj){
  const SU=window.SyncUtils;
  if(!SU || !window.authState?.user) return null;
  const entry=await cacheReadEntry(store);
  const base=Array.isArray(entry?.data) ? entry.data.find(r=>String(r.id)===String(obj.id)) : null;
  if(!base) return null;                                   // registro nuevo o sin versión local: upsert de siempre
  const changed=SU.diffFields(base,input,PUT_IGNORE);
  if(!Object.keys(changed).length) return base;            // nada que guardar
  const finish=async row=>{
    const saved=fromJS({...row,id:obj.id});
    await cacheUpdateStore(store,rows=>{
      const index=rows.findIndex(record=>String(record.id)===String(obj.id));
      if(index===-1) rows.push(saved); else rows[index]=saved;
      return rows;
    });
    return saved;
  };
  const lock=base.updatedAt||base.updatedat||null;
  let query=supabaseDB.from(tableName).update(toDB(changed)).eq('id',obj.id);
  if(lock) query=query.eq('updatedat',lock);               // solo escribe si nadie lo ha tocado desde que lo vi
  const first=await query.select();
  if(first.error) throw first.error;
  if(first.data && first.data.length) return finish(first.data[0]);
  // 0 filas: otro usuario lo modificó (o lo borró) → se lee lo que hay y se fusiona
  const current=await supabaseDB.from(tableName).select().eq('id',obj.id).maybeSingle();
  if(current.error) throw current.error;
  if(!current.data) return null;                           // borrado por otro: se recrea como antes
  const merge=SU.threeWayMerge(base,input,fromJS(current.data),{ignore:PUT_IGNORE,deltaFields:PUT_DELTA_FIELDS[store]||[]});
  let row=current.data;
  if(Object.keys(merge.patch).length){
    const second=await supabaseDB.from(tableName).update(toDB(merge.patch)).eq('id',obj.id).select();
    if(second.error) throw second.error;
    if(second.data && second.data[0]) row=second.data[0];
  }
  if(merge.conflicts.length) reportPutConflicts(store,obj.id,merge.conflicts);
  return finish(row);
}

async function dbPut(store,data){
  rejectAuthenticatedOfflineWrite();
  const tableName=TABLA[store]||store;
  const input={...data};
  delete input._light; delete input.fotosurls; delete input.fotoscount; // campos solo del listado ligero
  if(['partesTrabajo','revisiones','solicitudesMaterial'].includes(store) && window.authState?.user && !Object.prototype.hasOwnProperty.call(input,'createdBy')){
    input.createdBy=window.authState.user.id;
  }
  // Agregar updatedAt si no existe
  if(!input.updatedAt){
    input.updatedAt=new Date().toISOString();
  }
  const obj=toDB(input);
  if(!obj.id && store === 'partesTrabajo'){
    throw new Error('No se puede actualizar un parte sin su ID.');
  }
  if(!obj.id){
    const pref=(store==='partesTrabajo'?'PARTE':store.slice(0,3).toUpperCase());
    obj.id=nextId(pref);
  }
  const local=fromJS(obj);
  const update=rows=>{
    const index=rows.findIndex(record=>String(record.id)===String(obj.id));
    if(index===-1) rows.push(local);
    else {
      // Last-write-wins por updatedAt
      const existing=rows[index];
      const existingTime=existing.updatedAt?new Date(existing.updatedAt).getTime():0;
      const newTime=local.updatedAt?new Date(local.updatedAt).getTime():Date.now();
      if(newTime>=existingTime){
        rows[index]=local;
      }
    }
    return rows;
  };
  if(!navigator.onLine){
    await cacheUpdateStore(store,update);
    await enqueueSyncOperation({action:'put',store,data:local});
    return local;
  }
  try{
    if(store!=='partesTrabajo'){
      const merged=await putMerging(store,tableName,input,obj);
      if(merged) return merged;
    }
    // Para partes de trabajo, hacer merge por campos si hay conflicto
    let parteExiste=false;
    if(store==='partesTrabajo'){
      // La lectura directa de la tabla está restringida por columnas; se usa la función RPC
      const {data:rows,error:readError}=await supabaseDB.rpc('get_app_work_parts',{p_id:String(obj.id)});
      if(readError) throw readError;
      const existing=Array.isArray(rows)?rows[0]:null;
      parteExiste=!!existing;
      if(existing && existing.updatedat){
        const existingTime=new Date(existing.updatedat).getTime();
        const newTime=obj.updatedat?new Date(obj.updatedat).getTime():Date.now();
        if(newTime<existingTime){
          // La versión del servidor es más reciente, hacer merge
          const merged=mergePartesTrabajo(existing,fromJS({...obj}));
          Object.assign(obj,toDB(merged));
        }
      }
    }
    // Un upsert exige SELECT sobre las columnas restringidas (DNI, firmas, fotos); un UPDATE no
    const writeQuery=(store==='partesTrabajo' && parteExiste)
      ? (()=>{const {id:_id,...changes}=obj;return supabaseDB.from(tableName).update(changes).eq('id',obj.id);})()
      : supabaseDB.from(tableName).upsert(obj);
    const upsertQuery=writeQuery;
    const {data:result,error}=await (store==='partesTrabajo'
      ? upsertQuery.select('id').maybeSingle()
      : upsertQuery.select().maybeSingle());
    if(error) {
      if(String(error.code || '').toUpperCase() === 'PGRST116') return local;
      throw error;
    }
    const saved = result ? fromJS({...obj,...result,id:obj.id}) : local;
    await cacheUpdateStore(store,rows=>{
      const index=rows.findIndex(record=>String(record.id)===String(obj.id));
      if(index===-1) rows.push(saved);
      else rows[index]=saved;
      return rows;
    });
    return saved;
  }catch(error){
    if(!isNetworkError(error) && String(error?.code || '').toUpperCase() !== 'PGRST116') throw error;
    if(window.authState?.user) throw error;
    await cacheUpdateStore(store,update);
    await enqueueSyncOperation({action:'put',store,data:local});
    return local;
  }
}

async function dbGet(store,id){
  const entry=await cacheReadEntry(store);
  const cached=entry?.data;
  const found=Array.isArray(cached) ? cached.find(r=>String(r.id)===String(id)) : null;
  const pending=(await dbSyncQueueGetPending()).filter(item=>item.store===store && queueRecordId(item)===String(id)).pop();
  if(pending) return pending.action==='delete' ? null : pending.data;
  if(!navigator.onLine) return found||null;
  if(store==='partesTrabajo' && window.authState?.user){
    const {data,error}=await supabaseDB.rpc('get_app_work_parts',{p_id:String(id)});
    if(error) throw error;
    return Array.isArray(data) && data.length ? fromJS(data[0]) : null;
  }
  if(store==='almacen' && window.authState?.user){
    const {data,error}=await supabaseDB.rpc('get_app_warehouse');
    if(error) throw error;
    const rows=fromJSArray(data||[]);
    const item=rows.find(row=>String(row.id)===String(id))||null;
    return item;
  }
  const tableName=TABLA[store]||store;
  try{
    const {data,error}=await supabaseDB.from(tableName).select().eq('id',id).maybeSingle();
    if(error) {
      if(String(error.code || '').toUpperCase() === 'PGRST116') return found || null;
      throw error;
    }
    return data ? fromJS(data) : (found || null);
  }catch(error){
    if(isNetworkError(error)) return found||null;
    if(String(error?.code || '').toUpperCase() === 'PGRST116') return found||null;
    throw error;
  }
}

async function dbGetAll(store){
  const tableName=TABLA[store]||store;
  const entry=await cacheReadEntry(store);
  const cached=entry?.data;
  const cacheFresh=Array.isArray(cached) && entry.complete!==false && Date.now()-entry.ts<TTL;
  if(!navigator.onLine) return cacheApplyPending(store,Array.isArray(cached)?cached:[]);
  if(cacheFresh){
    const result=await cacheApplyPending(store,cached);
    // Realtime invalida la caché ante cualquier cambio; solo se refresca en segundo plano si tiene cierta edad
    if(Date.now()-entry.ts>=BG_REFRESH_AFTER) refreshStoreCache(store,tableName).catch(()=>{});
    return result;
  }
  try{
    return await refreshStoreCache(store,tableName);
  }catch(error){
    if(isNetworkError(error)) return cacheApplyPending(store,Array.isArray(cached)?cached:[]);
    throw error;
  }
}

// Lee toda la tabla por páginas: PostgREST devuelve como máximo 1000 filas por petición y el resto se perdía en silencio
async function selectAllRows(tableName){
  const SU=window.SyncUtils;
  if(!SU) return supabaseDB.from(tableName).select();
  let ordered=true;
  try{
    const data=await SU.fetchAllPages((from,to)=>{
      let q=supabaseDB.from(tableName).select('*',from===0?{count:'exact'}:{});
      if(ordered) q=q.order('id',{ascending:true});    // orden estable para que las páginas no se solapen
      return q.range(from,to).then(res=>{
        if(res.error && ordered && from===0 && String(res.error.code)==='42703'){   // tabla sin columna id
          ordered=false;
          return supabaseDB.from(tableName).select('*',{count:'exact'}).range(from,to);
        }
        return res;
      });
    });
    return {data,error:null};
  }catch(error){ return {data:null,error}; }
}

const _storeVersion = {};
const _refreshInFlight = {};
function refreshStoreCache(store,tableName){
  // Si ya hay una descarga en curso de la misma tabla, se reutiliza
  if(_refreshInFlight[store]) return _refreshInFlight[store];
  const promise=(async()=>{
    let result;
    for(let attempt=0;attempt<3;attempt++){
      const version=_storeVersion[store]||0;
      // Partes y almacén se leen con RPC (columnas restringidas por rol)
      const rpcName=window.authState?.user
        ? (store==='partesTrabajo' ? 'get_app_work_parts_list' : store==='almacen' ? 'get_app_warehouse' : null)
        : null;
      let {data,error}=rpcName
        ? await supabaseDB.rpc(rpcName)
        : await selectAllRows(tableName);
      // Si el listado ligero aún no está instalado en Supabase, se usa el completo
      if(error && rpcName==='get_app_work_parts_list') ({data,error}=await supabaseDB.rpc('get_app_work_parts'));
      if(error) throw error;
      result=await cacheApplyPending(store,fromJSArray(data||[]));
      // Si llegó un cambio en tiempo real durante la descarga, los datos pueden estar ya viejos: se repite
      if((_storeVersion[store]||0)!==version && attempt<2) continue;
      await cacheWrite(store,result,(_storeVersion[store]||0)===version);
      break;
    }
    if(window.__onDataSynced) window.__onDataSynced(store,result);
    return result;
  })();
  _refreshInFlight[store]=promise;
  const clear=()=>{ if(_refreshInFlight[store]===promise) delete _refreshInFlight[store]; };
  promise.then(clear,clear);
  return promise;
}

async function dbDelete(store,id){
  rejectAuthenticatedOfflineWrite();
  const tableName=TABLA[store]||store;
  const update=rows=>rows.filter(record=>String(record.id)!==String(id));
  if(!navigator.onLine){
    await cacheUpdateStore(store,update);
    await enqueueSyncOperation({action:'delete',store,id});
    return;
  }

  try{
    const {error}=await supabaseDB.from(tableName).delete().eq('id',id);
    if(error) throw error;
    await cacheUpdateStore(store,update);
  }catch(error){
    if(!isNetworkError(error)) throw error;
    if(window.authState?.user) throw error;
    await cacheUpdateStore(store,update);
    await enqueueSyncOperation({action:'delete',store,id});
  }
}

// ── Índices genéricos ──────────────────────────────────────
async function dbGetByIndex(store,indexName,value){
  const rows=await dbGetAll(store);
  const column=REN_IN[REN_OUT[indexName]||indexName]||indexName;
  return rows.filter(row=>String(row[column]??row[indexName])===String(value));
}

async function dbGetByIndexRange(store,indexName,range){
  const rows=await dbGetAll(store);
  if(range && ('lower' in range || 'upper' in range)){
    return rows.filter(row=>{
      const key=indexName.includes('matricula_fecha')
        ? [row.matricula||'',String(row.fecha||'').slice(0,10)]
        : row[REN_IN[REN_OUT[indexName]||indexName]||indexName];
      try{
        if(range.lower!==undefined){
          const cmp=indexedDB.cmp(key,range.lower);
          if(cmp<0 || (cmp===0&&range.lowerOpen)) return false;
        }
        if(range.upper!==undefined){
          const cmp=indexedDB.cmp(key,range.upper);
          if(cmp>0 || (cmp===0&&range.upperOpen)) return false;
        }
        return true;
      }catch(e){ return false; }
    });
  }
  return rows.filter(row=>{
    if(!range.gt&&!range.lt) return true;
    const columnValue=pair=>{
      const [column]=pair;
      return row[REN_IN[REN_OUT[column]||column]||column];
    };
    if(range.gt){
      const [column,value]=range.gt;
      if(columnValue(range.gt)<=value) return false;
    }
    if(range.lt){
      const [column,value]=range.lt;
      if(columnValue(range.lt)>=value) return false;
    }
    return true;
  });
}

// ── Cola offline (localStorage) ────────────────────────────
async function dbSyncQueuePush(item){
  return enqueueSyncOperation(item);
}

async function dbSyncQueueGetPending(){ return readSyncQueue().filter(isOwnQueueItem); }

async function dbSyncQueueComplete(id){
  const queue=readSyncQueue();
  writeSyncQueue(queue.filter(item=>(item.queueId||item.id)!==id));
}

async function dbSyncQueueClear(){
  writeSyncQueue([]);
}

let syncFlushPromise=null;
let syncRetryTimer=null;
let syncRetryDelay=5000;

function scheduleSyncRetry(){
  if(!navigator.onLine || syncRetryTimer) return;
  syncRetryTimer=setTimeout(()=>{
    syncRetryTimer=null;
    flushSyncQueue();
  },syncRetryDelay);
  syncRetryDelay=Math.min(syncRetryDelay*2,300000);
}

function moveSyncToFailed(item,error){
  const failed=readSyncFailed();
  failed.push({...item,error:window.SyncUtils.errorMessage(error),failedAt:new Date().toISOString()});
  writeSyncFailed(failed);
  writeSyncQueue(readSyncQueue().filter(q=>(q.queueId||q.id)!==(item.queueId||item.id)));
}

function bumpSyncAttempt(item,error,countAttempt){
  const queue=readSyncQueue();
  const found=queue.find(q=>(q.queueId||q.id)===(item.queueId||item.id));
  if(!found) return;
  if(countAttempt) found.attempts=(found.attempts||0)+1;
  found.lastError=window.SyncUtils.errorMessage(error);
  try{ writeSyncQueue(queue); }catch(e){}
}

async function flushSyncQueue(){
  if(!navigator.onLine || !window.authState?.user) return;
  if(syncFlushPromise) return syncFlushPromise;
  syncFlushPromise=(async()=>{
    const SU=window.SyncUtils;
    const queue=readSyncQueue().filter(isOwnQueueItem);
    for(const item of queue){
      try{
        const tableName=TABLA[item.store]||item.store;
        let response;
        if(item.action==='delete'){
          const recordId=item.recordId??(String(item.id||'').startsWith('SYNC-')?null:item.id);
          if(recordId===null || recordId===undefined){
            const bad=new Error('Operación de borrado sin id de registro'); bad.status=400; throw bad;
          }
          response=await supabaseDB.from(tableName).delete().eq('id',recordId);
        }else{
          const row=toDB(item.data);
          // La hora de edición es la del momento en que se hizo, no la de la sincronización
          if(item.editedAt) row.updatedat=item.editedAt;
          response=await supabaseDB.from(tableName).upsert(row);
        }
        if(response.error) throw SU.errorFromResponse(response);
        await dbSyncQueueComplete(item.queueId||item.id);
      }catch(error){
        const decision=SU.decideAfterError(error,item.attempts||0,{online:navigator.onLine});
        if(decision.action==='fail'){
          // El servidor la rechaza (permisos, datos inválidos…): reintentar no la arregla. Se aparta y se sigue con las demás.
          console.warn('[SyncQueue] operación rechazada, pasa a fallidas:',error.message);
          try{ moveSyncToFailed(item,error); }catch(e){}
          continue;
        }
        console.warn('[SyncQueue] operación conservada para reintento ('+decision.kind+'):',error.message);
        bumpSyncAttempt(item,error,decision.countAttempt);
        scheduleSyncRetry();
        break;                                           // sin red/sesión/servidor: el resto espera para mantener el orden
      }
    }
    const pending=readSyncQueue().filter(isOwnQueueItem);
    if(!pending.length) syncRetryDelay=5000;
    emitSyncState();
    return pending.length;
  })().finally(()=>{
    syncFlushPromise=null;
    if(navigator.onLine && readSyncQueue().filter(isOwnQueueItem).length) scheduleSyncRetry();
  });
  return syncFlushPromise;
}

// Operaciones que el servidor rechazó: el usuario puede reintentarlas o descartarlas
window.dbFlushSyncQueue=()=>flushSyncQueue();
window.dbSyncInfo=()=>({pending:readSyncQueue().filter(isOwnQueueItem),failed:readSyncFailed().filter(isOwnQueueItem)});
window.dbSyncFailedRetry=id=>{
  const failed=readSyncFailed();
  const index=failed.findIndex(item=>(item.queueId||item.id)===id);
  if(index===-1) return;
  const [item]=failed.splice(index,1);
  writeSyncFailed(failed);
  delete item.error; delete item.failedAt; item.attempts=0;
  const queue=readSyncQueue(); queue.push(item); writeSyncQueue(queue);
  flushSyncQueue();
};
window.dbSyncFailedDiscard=id=>{
  writeSyncFailed(readSyncFailed().filter(item=>(item.queueId||item.id)!==id));
  emitSyncState();
};

window.addEventListener('online',()=>flushSyncQueue());
window.addEventListener('offline',()=>window.dispatchEvent(new CustomEvent('autopuerta:sync-state',{detail:{pending:readSyncQueue().length,online:false}})));
setTimeout(()=>flushSyncQueue(),0);

// ── Seed protegido por flag ────────────────────────────────
async function seedIfEmpty(){
  if(localStorage.getItem('autopuerta_seed_hecho')==='1') return;
  const c=await dbGetAll('clientes');
  if(c.length>0){
    localStorage.setItem('autopuerta_seed_hecho','1');
    return;
  }

  const clientes=[
    {id:'CLI001',nombre:'Industrial del Norte S.L.',contacto:'Carlos Méndez',email:'carlos@industrialnorte.es',telefono:'948 123 456',direccion:'Pol. Industrial Norte, Nave 14, Vitoria',tipo:'empresa',nota:''},
    {id:'CLI002',nombre:'María García López',contacto:'María García',email:'maria.garcia@gmail.com',telefono:'677 234 567',direccion:'Calle Mayor 23, 1ºB, Burgos',tipo:'particular',nota:'Cliente desde 2022'},
    {id:'CLI003',nombre:'Logística Express S.A.',contacto:'Pedro Ruiz',email:'pedro@logexpress.com',telefono:'947 345 678',direccion:'Ctra. Nacional 1, Km 312, Logroño',tipo:'empresa',nota:''},
    {id:'CLI004',nombre:'Supermercados Central',contacto:'Ana Fernández',email:'ana@supcentral.es',telefono:'941 456 789',direccion:'Av. del Comercio 56, Pamplona',tipo:'empresa',nota:'3 locales'}
  ];
  for(const d of clientes) await dbPut('clientes',d);

  const tipos=[
    {id:'TP001',nombre:'Puerta Seccional',descripcion:'Puerta seccional estándar, manual o motorizada',checklist:['Estado general','Cierre','Sellado','Guías','Muelles']},
    {id:'TP002',nombre:'Puerta Rápida de Lona',descripcion:'Puerta rápida de alta velocidad, lona PVC',checklist:['Lona','Rodamientos','Mando','Células','Motor']},
    {id:'TP003',nombre:'Puerta Corredera',descripcion:'Puerta corredera industrial o residencial',checklist:['Estado general','Rodamientos','Guías','Cierre','Cerradura']},
    {id:'TP004',nombre:'Puerta Basculante',descripcion:'Puerta basculante de garaje',checklist:['Estado general','Muelles','Rodamientos','Guías','Motor']},
    {id:'TP005',nombre:'Motor / Automatización',descripcion:'Kit de motorización para puertas existentes',checklist:['Motor','Electrónica','Mandos','Limitadores','Cadenas']},
    {id:'TP006',nombre:'Mantenimiento',descripcion:'Servicio de mantenimiento preventivo o correctivo',checklist:['Limpieza','Lubricación','Ajuste','Pruebas','Documentación']},
    {id:'TP007',nombre:'Reparación',descripcion:'Reparación de averías y componentes',checklist:['Diagnóstico','Componente','Prueba','Limpieza','Documentación']}
  ];
  for(const t of tipos) await dbPut('tiposPuerta',t);

  const vehiculos=[
    {id:'VEH001',matricula:'1234 BKL',marca:'Fiat',modelo:'Ducato',anno:2022,estado:'disponible',km:45200,nota:'Vehículo principal'},
    {id:'VEH002',matricula:'5678 MNP',marca:'Renault',modelo:'Master',anno:2021,estado:'en_ruta',km:68300,nota:''},
    {id:'VEH003',matricula:'9012 QRS',marca:'Volkswagen',modelo:'Caddy',anno:2023,estado:'disponible',km:22100,nota:'Vehículo pequeño para ciudad'}
  ];
  for(const v of vehiculos) await dbPut('vehiculos',v);

  const almacen=[
    {id:'ART001',referencia:'PSE-2500-STD',nombre:'Puerta seccional 2500x2500mm estándar',unidad:'unidad',precioCompra:680,precioVenta:1250,stock:4,stockMinimo:2,proveedor:'PuertasGarcía S.L.',categoria:'producto'},
    {id:'ART002',referencia:'PPR-2000-VEL',nombre:'Puerta rápida lona 2000x2500mm velocidad',unidad:'unidad',precioCompra:1100,precioVenta:2100,stock:1,stockMinimo:1,proveedor:'FastDoor España',categoria:'producto'},
    {id:'ART003',referencia:'MOT-400-N',nombre:'Motor 400N para puerta seccional',unidad:'unidad',precioCompra:220,precioVenta:380,stock:8,stockMinimo:3,proveedor:'Automatech',categoria:'recambio'},
    {id:'ART004',referencia:'MUE-TOR-2000',nombre:'Muelle de torsión 2000 lbs',unidad:'unidad',precioCompra:95,precioVenta:165,stock:6,stockMinimo:2,proveedor:'PuertasGarcía S.L.',categoria:'recambio'},
    {id:'ART005',referencia:'CEL-FOT-IR',nombre:'Célula fotoeléctrica infrarroja',unidad:'unidad',precioCompra:35,precioVenta:72,stock:15,stockMinimo:5,proveedor:'SensoresPro',categoria:'recambio'},
    {id:'ART006',referencia:'COR-3000-IND',nombre:'Puerta corredera 3000x3000mm industrial',unidad:'unidad',precioCompra:850,precioVenta:1550,stock:2,stockMinimo:1,proveedor:'PuertasGarcía S.L.',categoria:'producto'}
  ];
  for(const a of almacen) await dbPut('almacen',a);

  const empleados=[
    {id:'EMP001',nombre:'Técnico Principal',telefono:'600 000 000',dni:'12345678A',email:''},
    {id:'EMP002',nombre:'Técnico Junior',telefono:'600 111 111',dni:'87654321B',email:''}
  ];
  for(const e of empleados) await dbPut('empleados',e);

  localStorage.setItem('autopuerta_seed_hecho','1');
}

// ── Exponer globales ───────────────────────────────────────
window.db={
  openDB,nextId,dbAdd,dbCreate,dbPut,dbGet,dbGetAll,dbDelete,
  dbGetByIndex,dbGetByIndexRange,
  dbSyncQueuePush,dbSyncQueueGetPending,dbSyncQueueComplete,dbSyncQueueClear,
  seedIfEmpty,cacheInvalidate
};
window.seedIfEmpty=seedIfEmpty;