/**
 * revision-forms.js - Sistema de formularios dinámicos de revisión
 * Genera formularios a partir de plantillas configurables en Supabase
 */

// ── Cargar plantillas ───────────────────────────────────────
async function cargarPlantillaRevision(plantillaId) {
  try {
    const { data, error } = await window.supabaseDB
      .from('plantillas_revisiones')
      .select('*')
      .eq('id', plantillaId)
      .eq('activo', true)
      .maybeSingle();

    if (error) throw error;
    return data;
  } catch (e) {
    console.error('Error cargando plantilla:', e);
    return null;
  }
}

async function cargarTodasPlantillas() {
  try {
    const { data, error } = await window.supabaseDB
      .from('plantillas_revisiones')
      .select('*')
      .eq('activo', true)
      .order('nombre');

    if (error) throw error;
    return data || [];
  } catch (e) {
    console.error('Error cargando plantillas:', e);
    return [];
  }
}

// ── Renderizador de campos ───────────────────────────────────
function renderCampo(config, valor = '', contexto = {}) {
  const id = config.id;
  const tipo = config.tipo;
  const label = config.label || '';
  const obligatorio = config.obligatorio || false;
  const required = obligatorio ? 'required' : '';

  let html = '';

  switch (tipo) {
    case 'texto':
      html = `<label for="${id}">${label}${obligatorio ? ' *' : ''}</label>
              <input id="${id}" type="text" value="${escapeHtml(valor)}" ${required}
                     oninput="actualizarCampo('${id}', this.value)" class="input">`;
      break;

    case 'fecha':
      const hoy = new Date().toISOString().slice(0, 10);
      html = `<label for="${id}">${label}${obligatorio ? ' *' : ''}</label>
              <input id="${id}" type="date" value="${valor || hoy}" ${required}
                     oninput="actualizarCampo('${id}', this.value)" class="input">`;
      break;

    case 'textarea':
      html = `<label for="${id}">${label}${obligatorio ? ' *' : ''}</label>
              <textarea id="${id}" rows="3" ${required}
                        oninput="actualizarCampo('${id}', this.value)" class="input">${escapeHtml(valor)}</textarea>`;
      break;

    case 'select':
      const opciones = config.opciones || [];
      html = `<label for="${id}">${label}${obligatorio ? ' *' : ''}</label>
              <select id="${id}" ${required} onchange="actualizarCampo('${id}', this.value)" class="input">
                <option value="">— Seleccionar —</option>
                ${opciones.map(op => `<option value="${op}" ${valor === op ? 'selected' : ''}>${escapeHtml(op)}</option>`).join('')}
              </select>`;
      break;

    case 'radio':
      const radioOpciones = config.opciones || [];
      html = `<label>${label}${obligatorio ? ' *' : ''}</label>
              <div class="radio-group">
                ${radioOpciones.map(opt => `
                  <label class="radio-option">
                    <input type="radio" name="${id}" value="${opt.valor}" ${valor === opt.valor ? 'checked' : ''}
                           onchange="actualizarCampo('${id}', this.value)">
                    <span>${escapeHtml(opt.label)}</span>
                  </label>
                `).join('')}
              </div>`;
      break;

    case 'fotos':
      const maxFotos = config.max_fotos || 10;
      const fotosArray = Array.isArray(valor) ? valor : [];
      html = `<label>${label}</label>
              <div class="fotos-field">
                <button type="button" class="btn btn-sm btn-primary" onclick="abrirCamaraCampo('${id}')">
                  <i class="fas fa-camera"></i> Añadir foto
                </button>
                <button type="button" class="btn btn-sm btn-outline" onclick="seleccionarFotoCampo('${id}')">
                  <i class="fas fa-image"></i> Seleccionar
                </button>
                <input id="${id}-file" type="file" accept="image/*" capture="environment" style="display:none"
                       onchange="agregarFotoCampo('${id}', this)">
                <div id="${id}-preview" class="fotos-preview">
                  ${fotosArray.map((foto, idx) => `
                    <div class="foto-item">
                      <img src="${foto}" alt="Foto ${idx + 1}">
                      <button type="button" class="btn btn-danger btn-icon" onclick="eliminarFotoCampo('${id}', ${idx})">
                        <i class="fas fa-times"></i>
                      </button>
                    </div>
                  `).join('')}
                </div>
                <small>${fotosArray.length}/${maxFotos} fotos</small>
              </div>`;
      break;

    default:
      console.warn('Tipo de campo no soportado:', tipo);
      html = `<label>${label}</label><div class="error">Tipo no soportado: ${tipo}</div>`;
  }

  return `<div class="form-group campo-${tipo}" data-campo-id="${id}" data-condicion="${config.condicion || ''}">${html}</div>`;
}

// ── Renderizador de formularios completos ───────────────────
async function renderFormularioRevision(plantillaId, contexto = {}) {
  const plantilla = await cargarPlantillaRevision(plantillaId);
  if (!plantilla) {
    return '<div class="error">No se encontró la plantilla</div>';
  }

  const config = plantilla.campos_config;
  let html = '';

  // Campos generales
  if (config.campos_generales && config.campos_generales.length) {
    html += '<div class="form-section">';
    html += '<h3>Datos generales</h3>';
    html += config.campos_generales.map(campo => renderCampo(campo, '', contexto)).join('');
    html += '</div>';
  }

  // Lista de equipos (DOTICS)
  if (config.lista_equipos) {
    html += '<div class="form-section">';
    html += '<div class="section-header"><h3>Equipos revisados</h3>';
    html += '<button type="button" class="btn btn-outline btn-sm" onclick="agregarEquipo()"><i class="fas fa-plus"></i> Añadir equipo</button></div>';
    html += '<div id="equipos-lista" class="equipos-list"></div>';
    html += '</div>';
  }

  // Estructura de tiendas (HIPERBER)
  if (config.estructura_tiendas && config.estructura_tiendas.tipo === 'tiendas_por_ruta') {
    html += '<div class="form-section">';
    html += '<h3>Tiendas de la ruta</h3>';
    html += '<div id="tiendas-lista"></div>';
    html += '</div>';
  }

  // Campos de puerta (individual)
  if (config.campos_puerta) {
    html += '<div class="form-section">';
    html += '<h3>Datos de la puerta</h3>';
    html += config.campos_puerta.map(campo => renderCampo(campo, '', contexto)).join('');
    html += '</div>';
  }

  // Observaciones generales
  if (config.observaciones_generales) {
    html += '<div class="form-section">';
    html += renderCampo(config.observaciones_generales, '', contexto);
    html += '</div>';
  }

  return html;
}

// ── Gestión de estado del formulario ───────────────────────
let formularioRevisionEstado = {};

function actualizarCampo(id, valor) {
  formularioRevisionEstado[id] = valor;
  evaluarCondiciones();
}

function evaluarCondiciones() {
  document.querySelectorAll('[data-condicion]').forEach(el => {
    const condicion = el.dataset.condicion;
    if (!condicion) return;

    // Evaluar condición simple: "campo = 'valor'"
    const match = condicion.match(/^(\w+)\s*=\s*'([^']*)'$/);
    if (match) {
      const campo = match[1];
      const valorEsperado = match[2];
      const valorActual = formularioRevisionEstado[campo];
      el.style.display = valorActual === valorEsperado ? 'block' : 'none';
    }
  });
}

// ── Gestión de fotos ───────────────────────────────────────
window.abrirCamaraCampo = function(campoId) {
  document.getElementById(campoId + '-file').click();
};

window.seleccionarFotoCampo = function(campoId) {
  const input = document.getElementById(campoId + '-file');
  if (!input) return;
  input.removeAttribute('capture');
  input.click();
  // Restaurar capture para que el siguiente uso del botón cámara vuelva a abrir la cámara
  input.addEventListener('cancel', () => input.setAttribute('capture', 'environment'), { once: true });
  input.addEventListener('change', () => input.setAttribute('capture', 'environment'), { once: true });
};

window.agregarFotoCampo = async function(campoId, input) {
  const file = input.files[0];
  if (!file) return;

  try {
    const fotoComprimida = await compressDoticsPhoto(file);
    formularioRevisionEstado[campoId] = formularioRevisionEstado[campoId] || [];
    formularioRevisionEstado[campoId].push(fotoComprimida);

    // Actualizar preview
    const preview = document.getElementById(campoId + '-preview');
    preview.innerHTML = formularioRevisionEstado[campoId].map((foto, idx) => `
      <div class="foto-item">
        <img src="${foto}" alt="Foto ${idx + 1}">
        <button type="button" class="btn btn-danger btn-icon" onclick="eliminarFotoCampo('${campoId}', ${idx})">
          <i class="fas fa-times"></i>
        </button>
      </div>
    `).join('');

    input.value = '';
  } catch (e) {
    console.error('Error procesando foto:', e);
    showToast('No se pudo procesar la foto', 'error');
  }
};

window.eliminarFotoCampo = function(campoId, index) {
  if (formularioRevisionEstado[campoId]) {
    formularioRevisionEstado[campoId].splice(index, 1);
    // Actualizar preview
    const preview = document.getElementById(campoId + '-preview');
    preview.innerHTML = formularioRevisionEstado[campoId].map((foto, idx) => `
      <div class="foto-item">
        <img src="${foto}" alt="Foto ${idx + 1}">
        <button type="button" class="btn btn-danger btn-icon" onclick="eliminarFotoCampo('${campoId}', ${idx})">
          <i class="fas fa-times"></i>
        </button>
      </div>
    `).join('');
  }
};

// escapeHtml ya no se redefine aquí: la única definición está en utils.js

// Exportar funciones globales
window.cargarPlantillaRevision = cargarPlantillaRevision;
window.cargarTodasPlantillas = cargarTodasPlantillas;
window.renderFormularioRevision = renderFormularioRevision;
window.evaluarCondiciones = evaluarCondiciones;

// ── Lista de equipos (plantilla DOTICS) ─────────────────────
// Estado de los equipos de la plantilla DOTICS: [{tipoProducto, denominacionCliente, numeroSerie, estado, observaciones, fotos}]
let formularioEquipos = [];

window.agregarEquipo = function() {
  formularioEquipos.push({ tipoProducto: '', denominacionCliente: '', numeroSerie: '', estado: '', observaciones: '', fotos: [] });
  renderEquiposLista();
};

window.quitarEquipo = function(index) {
  formularioEquipos.splice(index, 1);
  renderEquiposLista();
};

window.actualizarEquipo = function(index, campo, valor) {
  if (!formularioEquipos[index]) return;
  formularioEquipos[index][campo] = valor;
  if (campo === 'estado') renderEquiposLista();
};

function renderEquiposLista() {
  const container = document.getElementById('equipos-lista');
  if (!container) return;
  if (!formularioEquipos.length) {
    container.innerHTML = '<p style="color:var(--gray);text-align:center;">No hay equipos. Añade uno para empezar.</p>';
    return;
  }
  container.innerHTML = formularioEquipos.map((equipo, index) => `
    <section class="equipo-card">
      <div class="section-header">
        <h4>Equipo ${index + 1}</h4>
        ${formularioEquipos.length > 1 ? `<button type="button" class="btn btn-danger btn-sm" onclick="quitarEquipo(${index})"><i class="fas fa-trash"></i> Quitar</button>` : ''}
      </div>
      <div class="form-grid">
        <div class="form-group">
          <label for="equipo-tipo-${index}">Tipo producto</label>
          <select id="equipo-tipo-${index}" onchange="actualizarEquipo(${index}, 'tipoProducto', this.value)">
            <option value="">— Seleccionar —</option>
            ${window.TiposPuerta.opciones(equipo.tipoProducto, { por: 'codigo', etiqueta: 'codigo', vacio: false })}
          </select>
        </div>
        <div class="form-group">
          <label for="equipo-nombre-${index}">Denominación cliente</label>
          <input id="equipo-nombre-${index}" type="text" value="${escapeAttr(equipo.denominacionCliente)}" oninput="actualizarEquipo(${index}, 'denominacionCliente', this.value)">
        </div>
        <div class="form-group">
          <label for="equipo-serie-${index}">N.º de serie</label>
          <input id="equipo-serie-${index}" type="text" value="${escapeAttr(equipo.numeroSerie)}" oninput="actualizarEquipo(${index}, 'numeroSerie', this.value)">
        </div>
        <div class="form-group">
          <label for="equipo-estado-${index}">Estado</label>
          <select id="equipo-estado-${index}" onchange="actualizarEquipo(${index}, 'estado', this.value)">
            <option value="">— Seleccionar —</option>
            <option value="bueno" ${equipo.estado === 'bueno' ? 'selected' : ''}>Bueno</option>
            <option value="operativo" ${equipo.estado === 'operativo' ? 'selected' : ''}>Operativo</option>
            <option value="no_usar" ${equipo.estado === 'no_usar' ? 'selected' : ''}>No usar</option>
          </select>
        </div>
      </div>
      <div class="form-group">
        <label for="equipo-obs-${index}">Observaciones</label>
        <textarea id="equipo-obs-${index}" rows="2" oninput="actualizarEquipo(${index}, 'observaciones', this.value)">${escapeHtml(equipo.observaciones)}</textarea>
      </div>
    </section>
  `).join('');
}

// ── Guardado del formulario de plantilla ───────────────────
window.saveFormularioRevision = async function(plantillaId, opciones = {}) {
  const plantilla = await cargarPlantillaRevision(plantillaId);
  if (!plantilla) {
    showToast('No se encontró la plantilla', 'error');
    return null;
  }

  const config = plantilla.campos_config || {};
  const datos = { ...formularioRevisionEstado };
  const faltantes = [];

  // Validar obligatorios (campos generales, puerta y observaciones)
  const camposAValidar = [
    ...(config.campos_generales || []),
    ...(config.campos_puerta || []),
    ...(config.observaciones_generales ? [config.observaciones_generales] : [])
  ];
  for (const campo of camposAValidar) {
    if (campo.obligatorio && !String(datos[campo.id] ?? '').trim()) {
      faltantes.push(campo.label || campo.id);
    }
  }
  // Equipos DOTICS: al menos uno con tipo y estado
  if (config.lista_equipos) {
    if (!formularioEquipos.length) faltantes.push('Al menos un equipo');
    else if (formularioEquipos.some(e => !e.tipoProducto || !e.estado)) {
      faltantes.push('Tipo y estado de cada equipo');
    }
  }
  if (faltantes.length) {
    showToast('Faltan campos obligatorios: ' + faltantes.join(', '), 'error');
    return null;
  }

  // Construir items según el tipo de plantilla
  let items = [];
  if (config.lista_equipos) {
    items = formularioEquipos.map(equipo => ({
      concepto: [equipo.tipoProducto, equipo.denominacionCliente, equipo.numeroSerie].filter(Boolean).join(' · '),
      tipoProducto: equipo.tipoProducto,
      denominacionCliente: equipo.denominacionCliente,
      numeroSerie: equipo.numeroSerie,
      estado: equipo.estado === 'bueno' ? 'ok' : equipo.estado === 'operativo' ? 'desgaste' : 'correctivo',
      estadoEquipo: equipo.estado,
      hallazgo: equipo.observaciones,
      observaciones: equipo.observaciones,
      fotos: equipo.fotos || []
    }));
  }

  const notas = JSON.stringify({
    form: 'PLANTILLA_' + String(plantilla.nombre || plantillaId).replace(/[^a-zA-Z0-9]/g, '_').toUpperCase(),
    plantillaId: String(plantilla.id),
    tecnicos: datos.tecnicos || '',
    contrato: datos.contrato || '',
    intervencion: datos.intervencion || '',
    observaciones: datos.observaciones || ''
  });

  const fecha = datos.fecha || new Date().toISOString().slice(0, 10);
  const revision = {
    id: window.db.nextId('REV'),
    puertaId: opciones.puertaId || null,
    clienteId: opciones.clienteId || null,
    fecha,
    tecnicoId: opciones.tecnicoId || window.authState?.employee?.id || null,
    tecnicoNombre: window.authState?.employee?.nombre || datos.tecnicos || null,
    items,
    hallazgos: items.filter(i => i.hallazgo).map(i => i.concepto + ': ' + i.hallazgo).join(' | '),
    correctivo: '',
    estadoTrasRevision: items.some(i => i.estadoEquipo === 'no_usar') ? 'fuera_servicio' : 'operativa',
    notas,
    createdAt: new Date().toISOString()
  };

  try {
    await dbAdd('revisiones', revision);
    // Reset del estado tras guardar
    formularioRevisionEstado = {};
    formularioEquipos = [];
    showToast('Revisión guardada desde plantilla');
    return revision;
  } catch (e) {
    console.error('saveFormularioRevision falló:', e);
    showToast('No se pudo guardar la revisión: ' + e.message, 'error');
    return null;
  }
};

// ── Reset del estado al cerrar el modal ────────────────────
window.resetFormularioRevision = function() {
  formularioRevisionEstado = {};
  formularioEquipos = [];
};

// ── Re-exportar para uso externo ────────────────────────────
window.renderEquiposLista = renderEquiposLista;
