/* ═══════════════════════════════════════════
   MAPA DE FLOTA EN VIVO (solo administración)
   - Los técnicos con la app abierta envían su posición GPS
     (asociada al vehículo que tienen asignado en el parte activo
     o al último vehículo usado).
   - El admin ve los vehículos en un mapa Leaflet con marcadores
     personalizados (icono + etiqueta con la matrícula).
   ═══════════════════════════════════════════ */

const TRACK_INTERVAL_MS = 3 * 60 * 1000;   // posición cada 3 minutos
const POS_STALE_MS = 15 * 60 * 1000;       // >15 min sin actualizar = "sin señal"
const VEHICLE_COLORS = ['#16a34a', '#f97316', '#3b82f6', '#dc2626', '#8b5cf6', '#14b8a6', '#eab308', '#ec4899', '#06b6d6', '#84cc16'];

// ─────────────────────────────────────────────
// RASTREADOR (lado técnico, transparente)
// ─────────────────────────────────────────────
let __trackTimer = null;

async function getVehiculoParaTracking() {
  try {
    // 1. Vehículo del último parte activo del técnico de hoy
    const partes = await dbGetAll('partesTrabajo');
    const hoy = new Date().toISOString().slice(0, 10);
    const mios = (partes || [])
      .filter(p => String(p.fecha || '').slice(0, 10) === hoy && String(p.matricula || '').length > 2)
      .sort((a, b) => String(b.updatedAt || b.createdAt || '').localeCompare(String(a.updatedAt || a.createdAt || '')));
    if (mios[0]?.matricula) return mios[0].matricula;
    // 2. Fallback: último parte con vehículo, aunque no sea de hoy
    const conMatricula = (partes || []).filter(p => p.matricula)
      .sort((a, b) => String(b.updatedAt || b.createdAt || '').localeCompare(String(a.updatedAt || a.createdAt || '')));
    return conMatricula[0]?.matricula || null;
  } catch (_) { return null; }
}

async function sendPosition() {
  if (!navigator.geolocation || !window.authState?.user) return;
  const matricula = await getVehiculoParaTracking();
  if (!matricula) return; // sin vehículo asignado, no enviamos nada
  navigator.geolocation.getCurrentPosition(async pos => {
    try {
      const { error } = await window.supabaseDB
        .from('posiciones_vehiculo')
        .upsert({
          matricula: String(matricula).toUpperCase(),
          user_id: window.authState.user.id,
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          velocidad: pos.coords.speed != null ? Math.round(pos.coords.speed * 3.6) : null,
          actualizado_en: new Date().toISOString()
        }, { onConflict: 'matricula' });
      if (error) console.warn('[tracking] error:', error.message);
    } catch (e) { /* silencioso: el tracking nunca molesta */ }
  }, () => { }, { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 });
}

function startTracking() {
  if (!window.isTechnician?.()) return; // solo técnicos envían
  if (__trackTimer) return;
  sendPosition(); // primera posición inmediata
  __trackTimer = setInterval(sendPosition, TRACK_INTERVAL_MS);
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) sendPosition();
  });
}

function stopTracking() {
  if (__trackTimer) { clearInterval(__trackTimer); __trackTimer = null; }
}

window.addEventListener('valgom:authenticated', () => setTimeout(startTracking, 5000));
window.addEventListener('valgom:logged-out', stopTracking);

// ─────────────────────────────────────────────
// VISTA ADMIN: MAPA
// ─────────────────────────────────────────────
let __map = null;
let __mapMarkers = {};
let __mapRefreshTimer = null;
let __leafletsLoaded = false;

function loadLeaflet() {
  if (__leafletsLoaded) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const css = document.createElement('link');
    css.rel = 'stylesheet';
    css.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
    document.head.appendChild(css);
    const js = document.createElement('script');
    js.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
    js.onload = () => { __leafletsLoaded = true; resolve(); };
    js.onerror = () => reject(new Error('No se pudo cargar el mapa'));
    document.head.appendChild(js);
  });
}

function vehicleColor(i) { return VEHICLE_COLORS[i % VEHICLE_COLORS.length]; }

function markerIcon(matricula, color, stale) {
  return L.divIcon({
    className: '',
    html: `<div class="veh-marker ${stale ? 'veh-stale' : ''}" style="--veh-color:${color}">
             <div class="veh-pin"><i class="fas fa-truck-fast"></i></div>
             <div class="veh-label">${matricula}</div>
           </div>`,
    iconSize: [44, 58],
    iconAnchor: [22, 58]
  });
}

function haceMinutos(iso) {
  if (!iso) return null;
  const ms = Date.now() - new Date(iso).getTime();
  return Math.floor(ms / 60000);
}

async function fetchPosiciones() {
  try {
    const { data, error } = await window.supabaseDB
      .from('posiciones_vehiculo')
      .select('matricula, lat, lng, velocidad, actualizado_en');
    if (error) throw error;
    return data || [];
  } catch (e) {
    console.error('[mapa] error al cargar posiciones:', e);
    return [];
  }
}

async function refreshMarkers() {
  if (!__map) return;
  const posiciones = await fetchPosiciones();
  const vehiculos = await dbGetAll('vehiculos');
  const vehMap = new Map(vehiculos.map(v => [String(v.matricula).toUpperCase(), v]));

  const vistos = new Set();
  let hayRecientes = false;
  const bounds = [];

  for (const p of posiciones) {
    const mat = String(p.matricula).toUpperCase();
    vistos.add(mat);
    const minutos = haceMinutos(p.actualizado_en);
    const stale = minutos == null || minutos > 15;
    if (!stale) hayRecientes = true;

    const veh = vehMap.get(mat);
    const idx = vehiculos.findIndex(v => String(v.matricula).toUpperCase() === mat);
    const color = vehicleColor(idx);
    const label = `${mat}`;
    const popup = `
      <div style="font-family:inherit;min-width:190px">
        <strong style="color:${color}">🚐 ${mat}</strong><br>
        ${veh ? `${veh.marca || ''} ${veh.modelo || ''}<br>` : ''}
        ${stale
        ? `<span style="color:#ef4444">⚫ Sin señal (${minutos == null ? '?' : minutos} min)</span><br>`
        : `<span style="color:#16a34a">🟢 En movimiento ahora</span><br>`}
        ${p.velocidad != null ? `Velocidad: ${p.velocidad} km/h<br>` : ''}
        Última posición: ${p.actualizado_en ? new Date(p.actualizado_en).toLocaleTimeString('es-ES') : '?'}<br>
        <a href="https://www.google.com/maps?q=${p.lat},${p.lng}" target="_blank" style="color:#3b82f6">Abrir en Google Maps</a>
      </div>`;

    if (__mapMarkers[mat]) {
      __mapMarkers[mat].setLatLng([p.lat, p.lng]);
      __mapMarkers[mat].setIcon(markerIcon(label, color, stale));
      __mapMarkers[mat].setPopupContent(popup);
    } else {
      __mapMarkers[mat] = L.marker([p.lat, p.lng], { icon: markerIcon(label, color, stale) })
        .addTo(__map)
        .bindPopup(popup);
    }
    bounds.push([p.lat, p.lng]);
  }

  // Quitar marcadores de matrículas que ya no existen
  Object.keys(__mapMarkers).forEach(mat => {
    if (!vistos.has(mat)) { __map.removeLayer(__mapMarkers[mat]); delete __mapMarkers[mat]; }
  });

  if (bounds.length && !__map.__fitted) {
    __map.fitBounds(bounds, { padding: [50, 50], maxZoom: 15 });
    __map.__fitted = true;
  }

  const estado = document.getElementById('mapaEstado');
  if (estado) {
    estado.innerHTML = hayRecientes
      ? '<span style="color:#16a34a">🟢 Flota en seguimiento</span>'
      : '<span style="color:#f59e0b">🟡 Sin señal reciente — los técnicos actualizan su posición cada 3 min con la app abierta</span>';
  }
}

window.render_mapaVehiculos = async function (el) {
  el.innerHTML = `
    <section class="mapa-page">
      <div class="page-header">
        <div><h2><i class="fas fa-map-location-dot"></i> Mapa de flota</h2>
        <p>Posición en vivo de los vehículos. Los técnicos la envían automáticamente con la app abierta.</p></div>
        <div class="header-actions">
          <span id="mapaEstado" class="mapa-estado">Cargando…</span>
          <button class="btn btn-outline btn-sm" id="mapaRefresh"><i class="fas fa-rotate"></i> Actualizar</button>
        </div>
      </div>
      <div class="card mapa-card">
        <div id="fleetMap" class="fleet-map">
          <div class="mapa-loading"><i class="fas fa-circle-notch fa-spin"></i> Cargando mapa…</div>
        </div>
        <div class="mapa-leyenda" id="mapaLeyenda"></div>
      </div>
    </section>`;

  try {
    await loadLeaflet();
    const container = document.getElementById('fleetMap');
    if (!__map) {
      __map = L.map(container, { zoomControl: true, attributionControl: false }).setView([40.0, -3.7], 6);
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
        // Atribución obligatoria de OSM: la mostramos discreta en la leyenda
      }).addTo(__map);
    } else {
      __map.remove();
      __map = L.map(container, { zoomControl: true, attributionControl: false }).setView([40.0, -3.7], 6);
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19 }).addTo(__map);
      __mapMarkers = {};
      __map.__fitted = false;
    }

    await refreshMarkers();

    document.getElementById('mapaRefresh').onclick = refreshMarkers;
    if (__mapRefreshTimer) clearInterval(__mapRefreshTimer);
    __mapRefreshTimer = setInterval(() => {
      if (document.getElementById('fleetMap')) refreshMarkers();
      else { clearInterval(__mapRefreshTimer); __mapRefreshTimer = null; }
    }, 30000);

    // Leyenda con los vehículos y sus colores
    const vehiculos = await dbGetAll('vehiculos');
    const leyenda = document.getElementById('mapaLeyenda');
    if (leyenda) {
      leyenda.innerHTML = vehiculos.length
        ? vehiculos.map((v, i) => `<span class="mapa-leyenda-item" style="--veh-color:${vehicleColor(i)}">
             <span class="dot"></span> ${String(v.matricula).toUpperCase()} <small>${v.marca || ''} ${v.modelo || ''}</small></span>`).join('')
        : '<small style="color:var(--text-muted)">No hay vehículos registrados</small>';
    }
  } catch (e) {
    document.getElementById('fleetMap').innerHTML =
      `<div class="mapa-loading">⚠️ ${e.message}. Comprueba tu conexión.</div>`;
  }
};
