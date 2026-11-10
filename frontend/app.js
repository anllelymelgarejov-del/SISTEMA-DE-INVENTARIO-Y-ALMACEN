/**
 * ============================================================================
 * SISTEMA DE INVENTARIO Y ALMACENES - CONTROLADOR FRONTEND (APP.JS)
 * ============================================================================
 * 1. Autenticación y control de accesos por rol (ADMIN vs OPERARIO).
 * 2. Visualización segmentada de stock por pestañas de cada Almacén con Tooltips UI.
 * 3. Historial de movimientos auditado (Kardex) con usuario, rol, proveedor y fecha DD/MM/AAAA HH:mm:ss.
 * 4. Modal único para registrar Entrada (+) y Salida (-) por Lote con Módulo de Proveedores.
 * 5. Exportación de reportes (Excel / PDF) con indicador visual de carga (Spinner / Toast).
 * 6. Gestión de catálogo de productos y usuarios (exclusivo ADMIN).
 */

const API_BASE_URL = window.location.origin;

// Estado central de la aplicación
const estadoApp = {
  token: null,
  usuario: null,
  almacenes: [],
  productos: [],
  inventario: [],
  movimientos: [],
  logsAuditoria: [],
  idAlmacenActivo: null,
};

// ============================================================================
// 1. HELPER FETCH AUTENTICADO Y UTILIDADES DE FORMATO
// ============================================================================
async function fetchAutenticado(url, options = {}) {
  const fullUrl = url.startsWith('http') ? url : `${API_BASE_URL}${url}`;
  const token = estadoApp.token || localStorage.getItem('token');

  const headers = {
    'Accept': 'application/json',
    ...(options.headers || {}),
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  try {
    const respuesta = await fetch(fullUrl, { credentials: 'same-origin', ...options, headers });

    if (respuesta.status === 401) {
      localStorage.clear();
      window.location.href = 'login.html';
      throw new Error('Sesión expirada');
    }

    const data = await respuesta.json();
    if (!respuesta.ok) {
      throw new Error(data.mensaje || data.error || `Error en la petición (${respuesta.status})`);
    }

    return data;
  } catch (error) {
    console.error(`Error en fetchAutenticado [${url}]:`, error);
    throw error;
  }
}

/**
 * Formatea una fecha ISO o Timestamp al formato amigable DD/MM/AAAA HH:mm:ss
 */
function formatearFechaHoraAuditoria(fechaInput) {
  if (!fechaInput) return 'N/A';
  try {
    const d = new Date(fechaInput);
    if (isNaN(d.getTime())) return String(fechaInput);
    const pad = (n) => String(n).padStart(2, '0');
    const dia = pad(d.getDate());
    const mes = pad(d.getMonth() + 1);
    const anio = d.getFullYear();
    const horas = pad(d.getHours());
    const minutos = pad(d.getMinutes());
    const segundos = pad(d.getSeconds());
    return `${dia}/${mes}/${anio} ${horas}:${minutos}:${segundos}`;
  } catch (e) {
    return String(fechaInput);
  }
}

function escaparHtml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// ============================================================================
// 2. SESIÓN, ROLES Y CONTROL DE ACCESO
// ============================================================================
function verificarYConfigurarSesion() {
  const token = localStorage.getItem('token');
  if (!token) {
    window.location.href = 'login.html';
    return false;
  }

  estadoApp.token = token;

  let usuarioGuardado = null;
  try {
    usuarioGuardado = JSON.parse(localStorage.getItem('usuario'));
  } catch (e) {
    usuarioGuardado = null;
  }

  const nombre = usuarioGuardado?.nombre || localStorage.getItem('nombre') || 'Usuario';
  const rol = (usuarioGuardado?.rol || localStorage.getItem('rol') || 'OPERARIO').toUpperCase();
  const id_usuario = usuarioGuardado?.id_usuario || usuarioGuardado?.id || (rol === 'ADMIN' ? 1 : 2);

  estadoApp.usuario = { id_usuario, nombre, rol, email: usuarioGuardado?.email || '' };

  const elementoNombre = document.getElementById('user-nombre');
  if (elementoNombre) elementoNombre.textContent = nombre;

  const elementoAvatar = document.getElementById('user-avatar-initials');
  if (elementoAvatar) {
    const partes = nombre.trim().split(' ');
    const iniciales = partes.length > 1
      ? (partes[0][0] + partes[1][0]).toUpperCase()
      : nombre.substring(0, 2).toUpperCase();
    elementoAvatar.textContent = iniciales;
  }

  renderizarSegunRol();
  return true;
}

function renderizarSegunRol() {
  const rol = (estadoApp.usuario?.rol || localStorage.getItem('rol') || 'OPERARIO').toUpperCase();
  const elementoRol = document.getElementById('user-rol');

  if (elementoRol) {
    elementoRol.textContent = rol;
    if (rol === 'OPERARIO') {
      elementoRol.className = 'badge mt-1 bg-success text-white';
    } else {
      elementoRol.className = 'badge mt-1 bg-danger text-white';
    }
  }

  const elementosAdmin = document.querySelectorAll('.solo-admin');
  const elementosOperario = document.querySelectorAll('.solo-operario');

  if (rol === 'OPERARIO') {
    elementosAdmin.forEach(el => el.classList.add('d-none'));
    elementosOperario.forEach(el => el.classList.remove('d-none'));

    const tabInvBtn = document.getElementById('tab-inv-btn');
    if (tabInvBtn) bootstrap.Tab.getOrCreateInstance(tabInvBtn).show();
  } else if (rol === 'ADMIN') {
    elementosAdmin.forEach(el => el.classList.remove('d-none'));
    elementosOperario.forEach(el => el.classList.add('d-none'));
    cargarUsuarios();
    cargarLogsAuditoria();
  }
}

function configurarLogout() {
  const btnLogout = document.getElementById('btn-logout');
  if (!btnLogout) return;

  btnLogout.addEventListener('click', async () => {
    const confirmacion = await Swal.fire({
      title: '¿Cerrar Sesión?',
      text: 'Tendrás que iniciar sesión nuevamente para acceder.',
      icon: 'question',
      showCancelButton: true,
      confirmButtonColor: '#ef4444',
      cancelButtonColor: '#64748b',
      confirmButtonText: 'Sí, salir',
      cancelButtonText: 'Cancelar',
    });

    if (confirmacion.isConfirmed) {
      localStorage.clear();
      window.location.href = 'login.html';
    }
  });
}

// ============================================================================
// 3. CARGA DE DATOS PRINCIPALES Y TOOLTIPS EN TABLA DE INVENTARIO
// ============================================================================
async function cargarDatosIniciales() {
  try {
    const [resAlmacenes, resProductos, resInventario] = await Promise.all([
      fetchAutenticado('/api/almacenes'),
      fetchAutenticado('/api/productos'),
      fetchAutenticado('/api/inventario'),
    ]);

    estadoApp.almacenes = resAlmacenes.data || [];
    estadoApp.productos = resProductos.productos || resProductos.data || [];
    estadoApp.inventario = resInventario.data || [];

    if (!estadoApp.idAlmacenActivo && estadoApp.almacenes.length > 0) {
      estadoApp.idAlmacenActivo = estadoApp.almacenes[0].id_almacen;
    }

    renderizarPillsAlmacenes();
    renderizarTablaAlmacenActivo();
    poblarSelectoresModalMovimiento();
  } catch (error) {
    console.error('Error al cargar datos iniciales:', error);
  }
}

function renderizarPillsAlmacenes() {
  const contenedorPills = document.getElementById('pills-almacenes');
  if (!contenedorPills) return;

  if (estadoApp.almacenes.length === 0) {
    contenedorPills.innerHTML = '<li class="nav-item"><span class="nav-link text-muted">No hay almacenes</span></li>';
    return;
  }

  contenedorPills.innerHTML = estadoApp.almacenes.map(alm => {
    const activo = alm.id_almacen === estadoApp.idAlmacenActivo ? 'active' : '';
    return `
      <li class="nav-item" role="presentation">
        <button class="nav-link ${activo} d-flex align-items-center gap-2" 
                data-id-almacen="${alm.id_almacen}" 
                title="Consultar stock de ${escaparHtml(alm.nombre)}"
                data-tooltip="Cambiar a sede: ${escaparHtml(alm.nombre)}"
                type="button">
          <i class="fa-solid fa-warehouse"></i>
          <span>${escaparHtml(alm.nombre)}</span>
        </button>
      </li>
    `;
  }).join('');

  contenedorPills.querySelectorAll('button[data-id-almacen]').forEach(boton => {
    boton.addEventListener('click', () => {
      estadoApp.idAlmacenActivo = parseInt(boton.dataset.idAlmacen, 10);
      contenedorPills.querySelectorAll('button').forEach(b => b.classList.remove('active'));
      boton.classList.add('active');
      renderizarTablaAlmacenActivo();
    });
  });
}

function renderizarTablaAlmacenActivo() {
  const tbody = document.getElementById('tbody-productos-almacen');
  if (!tbody) return;

  const almacenActivo = estadoApp.almacenes.find(a => a.id_almacen === estadoApp.idAlmacenActivo);
  if (almacenActivo) {
    const elNombre = document.getElementById('almacen-activo-nombre');
    const elCodigo = document.getElementById('almacen-activo-codigo');
    const elDir = document.getElementById('almacen-activo-direccion');
    if (elNombre) elNombre.textContent = almacenActivo.nombre;
    if (elCodigo) elCodigo.textContent = almacenActivo.codigo || `ALM-${almacenActivo.id_almacen}`;
    if (elDir) elDir.textContent = almacenActivo.direccion || almacenActivo.ubicacion || 'Sede Principal';
  }

  const itemsAlmacen = estadoApp.inventario.filter(inv => inv.id_almacen === estadoApp.idAlmacenActivo);
  const filtroTexto = (document.getElementById('filtro-buscar')?.value || '').toLowerCase().trim();
  const filtroFefo = (document.getElementById('filtro-fefo')?.value || '').toLowerCase().trim();

  const filtrados = itemsAlmacen.filter(item => {
    if (filtroTexto) {
      const matchNom = (item.nombre_producto || item.producto || item.producto_nombre || '').toLowerCase().includes(filtroTexto);
      const matchCod = (item.codigo_barras || '').toLowerCase().includes(filtroTexto);
      const matchLot = (item.numero_lote || '').toLowerCase().includes(filtroTexto);
      if (!matchNom && !matchCod && !matchLot) return false;
    }
    if (filtroFefo) {
      const dias = calcularDiasParaVencer(item.fecha_vencimiento, item.dias_para_vencer);
      if (filtroFefo === 'vencido' && dias >= 0) return false;
      if (filtroFefo === 'critico' && (dias < 0 || dias > 30)) return false;
      if (filtroFefo === 'proximo' && (dias <= 30 || dias > 90)) return false;
      if (filtroFefo === 'optimo' && dias <= 90) return false;
    }
    return true;
  });

  if (filtrados.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="7" class="text-center py-5 text-muted">
          <i class="fa-solid fa-boxes-stacked fs-3 d-block mb-2 text-secondary"></i>
          No se encontraron productos en este almacén.
        </td>
      </tr>
    `;
    return;
  }

  tbody.innerHTML = filtrados.map(item => {
    const badgeFefo = obtenerBadgeFefo(item.fecha_vencimiento, item.dias_para_vencer);
    const fechaVenc = item.fecha_vencimiento ? item.fecha_vencimiento.substring(0, 10) : 'N/A';
    const nombreProd = item.nombre_producto || item.producto || item.producto_nombre || 'N/A';
    const loteStr = item.numero_lote || 'N/A';
    const stockActual = Number(item.cantidad) || 0;
    const stockMinimo = Number(item.stock_minimo ?? 10);
    const enAlertaStock = Boolean(item.alerta_stock) || stockActual <= stockMinimo;
    const badgeStockMinimo = enAlertaStock
      ? `<div class="mt-1">
           <span class="badge badge-stock-minimo py-1 px-2.5 rounded-pill d-inline-flex align-items-center gap-1"
                 title="Punto de reorden alcanzado (Stock mínimo: ${stockMinimo} uds)"
                 data-tooltip="Crítico por Stock (Mín: ${stockMinimo} uds) - Reabastecer">
             <i class="fa-solid fa-triangle-exclamation"></i>
             <span>Stock Mínimo / Reabastecer</span>
           </span>
         </div>`
      : '';

    return `
      <tr>
        <td class="ps-3 ps-md-4">
          <div class="fw-bold text-dark">${escaparHtml(nombreProd)}</div>
          <small class="text-muted">${escaparHtml(item.descripcion || '')}</small>
        </td>
        <td>
          <span class="badge bg-light text-dark font-monospace border"
                title="Código de barras / SKU: ${escaparHtml(item.codigo_barras || 'N/A')}"
                data-tooltip="SKU: ${escaparHtml(item.codigo_barras || 'N/A')}">
            ${escaparHtml(item.codigo_barras || 'N/A')}
          </span>
        </td>
        <td>
          <span class="badge bg-light text-secondary font-monospace border lote-badge-interactive btn-ver-lote"
                title="Ver detalles del lote"
                data-tooltip="Ver detalles del lote"
                data-producto="${escaparHtml(nombreProd)}"
                data-codigo="${escaparHtml(item.codigo_barras || 'N/A')}"
                data-lote="${escaparHtml(loteStr)}"
                data-vencimiento="${escaparHtml(fechaVenc)}"
                data-cantidad="${item.cantidad}"
                data-stock-minimo="${stockMinimo}"
                data-almacen="${escaparHtml(almacenActivo?.nombre || 'Almacén')}">
            <i class="fa-solid fa-tag me-1 text-primary" style="font-size: 0.68rem;"></i>${escaparHtml(loteStr)}
          </span>
        </td>
        <td class="small font-monospace">${escaparHtml(fechaVenc)}</td>
        <td class="text-end">
          <div class="fw-bold fs-6 ${enAlertaStock ? 'text-danger' : 'text-primary'}">${item.cantidad} uds</div>
          ${badgeStockMinimo}
        </td>
        <td class="text-center">${badgeFefo}</td>
        <td class="text-center pe-3 pe-md-4">
          <button class="btn btn-sm btn-outline-primary py-1 px-2.5 rounded-3 btn-operar-item"
                  data-id-almacen="${item.id_almacen}"
                  data-id-producto="${item.id_producto}"
                  data-lote="${escaparHtml(item.numero_lote || '')}"
                  title="Realizar ajuste o transferencia de stock"
                  data-tooltip="Realizar ajuste o transferencia de stock">
            <i class="fa-solid fa-arrow-right-arrow-left"></i>
          </button>
        </td>
      </tr>
    `;
  }).join('');

  tbody.querySelectorAll('.btn-operar-item').forEach(btn => {
    btn.addEventListener('click', () => {
      abrirModalMovimientoPreseleccionado({
        idAlmacen: btn.dataset.idAlmacen,
        idProducto: btn.dataset.idProducto,
        numeroLote: btn.dataset.lote,
      });
    });
  });

  tbody.querySelectorAll('.btn-ver-lote').forEach(badge => {
    badge.addEventListener('click', () => {
      verDetallesLote({
        producto: badge.dataset.producto,
        codigo: badge.dataset.codigo,
        lote: badge.dataset.lote,
        vencimiento: badge.dataset.vencimiento,
        cantidad: badge.dataset.cantidad,
        almacen: badge.dataset.almacen,
      });
    });
  });
}

function verDetallesLote({ producto, codigo, lote, vencimiento, cantidad, almacen }) {
  const dias = calcularDiasParaVencer(vencimiento);
  const badgeHtml = obtenerBadgeFefo(vencimiento, dias);
  const estadoTexto = dias < 0
    ? `Vencido (${dias} días) - Bloqueado para despacho`
    : dias <= 30
      ? `Crítico (${dias} días) - Prioridad máxima FEFO`
      : dias <= 90
        ? `Próximo (${dias} días) - Vencimiento medio`
        : `Óptimo (${dias} días) - Vigencia óptima`;

  if (typeof Swal !== 'undefined') {
    Swal.fire({
      title: `Detalles del Lote: ${lote}`,
      html: `
        <div class="text-start small border rounded-3 p-3 bg-light">
          <div class="mb-2"><strong>Producto:</strong> ${escaparHtml(producto)}</div>
          <div class="mb-2"><strong>Código SKU:</strong> <span class="font-monospace">${escaparHtml(codigo)}</span></div>
          <div class="mb-2"><strong>Sede / Almacén:</strong> ${escaparHtml(almacen)}</div>
          <div class="mb-2"><strong>Fecha de Vencimiento:</strong> <span class="font-monospace">${escaparHtml(vencimiento)}</span></div>
          <div class="mb-2"><strong>Stock Disponible:</strong> <span class="fw-bold text-primary">${escaparHtml(cantidad)} unidades</span></div>
          <div class="d-flex align-items-center gap-2 flex-wrap"><strong>Estado FEFO:</strong> ${badgeHtml} <span class="text-muted">(${escaparHtml(estadoTexto)})</span></div>
        </div>
      `,
      icon: 'info',
      confirmButtonText: 'Cerrar',
      confirmButtonColor: '#1d4ed8',
    });
  }
}

function calcularDiasParaVencer(fechaStr, diasPrecalculados = null) {
  if (diasPrecalculados !== null && diasPrecalculados !== undefined && diasPrecalculados !== '' && !isNaN(Number(diasPrecalculados))) {
    return parseInt(diasPrecalculados, 10);
  }
  if (!fechaStr) return 9999;
  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0);

  const partes = String(fechaStr).substring(0, 10).split('-').map(Number);
  const vence = partes.length === 3 && !partes.some(isNaN)
    ? new Date(partes[0], partes[1] - 1, partes[2])
    : new Date(fechaStr);
  vence.setHours(0, 0, 0, 0);

  return Math.round((vence - hoy) / (1000 * 60 * 60 * 24));
}

function obtenerTextoEstadoFefo(fechaStr, diasPrecalculados = null) {
  const dias = calcularDiasParaVencer(fechaStr, diasPrecalculados);
  if (dias < 0) return `Vencido (${dias} días)`;
  if (dias <= 30) return `Crítico (${dias} días)`;
  if (dias <= 90) return `Próximo (${dias} días)`;
  return `Óptimo (${dias} días)`;
}

function obtenerBadgeFefo(fechaStr, diasPrecalculados = null) {
  const dias = calcularDiasParaVencer(fechaStr, diasPrecalculados);
  if (dias < 0) {
    return `<span class="badge badge-fefo-vencido py-1 px-2.5 rounded-pill" title="Lote vencido (${dias} días) - No despachar" data-tooltip="Lote vencido (${dias} días) - No despachar"><i class="fa-solid fa-ban me-1"></i>Vencido (${dias} días)</span>`;
  } else if (dias <= 30) {
    return `<span class="badge badge-fefo-critico py-1 px-2.5 rounded-pill" title="Prioridad crítica FEFO (${dias} días)" data-tooltip="Despacho prioritario FEFO (${dias} días)"><i class="fa-solid fa-triangle-exclamation me-1"></i>Crítico (${dias} días)</span>`;
  } else if (dias <= 90) {
    return `<span class="badge badge-fefo-proximo py-1 px-2.5 rounded-pill" title="Vencimiento próximo (${dias} días)" data-tooltip="Vencimiento medio (${dias} días)"><i class="fa-solid fa-clock me-1"></i>Próximo (${dias} días)</span>`;
  } else {
    return `<span class="badge badge-fefo-optimo py-1 px-2.5 rounded-pill" title="Vigencia óptima (${dias} días)" data-tooltip="Vigencia óptima (${dias} días)"><i class="fa-solid fa-circle-check me-1"></i>Óptimo (${dias} días)</span>`;
  }
}

// ============================================================================
// 4. HISTORIAL DE MOVIMIENTOS Y AUDITORÍA POR USUARIO
// ============================================================================

/**
 * Obtiene y renderiza el historial de movimientos mediante fetch('/api/movimientos')
 */
async function cargarHistorialMovimientos() {
  const tbody = document.getElementById('tabla-historial-body');
  if (!tbody) return;

  try {
    tbody.innerHTML = '<tr><td colspan="8" class="text-center text-muted py-4"><div class="spinner-border spinner-border-sm text-primary me-2"></div>Cargando historial auditado de movimientos...</td></tr>';

    const data = await fetchAutenticado('/api/movimientos');
    const movimientos = Array.isArray(data) ? data : (data.data || []);
    estadoApp.movimientos = movimientos;

    if (!movimientos || movimientos.length === 0) {
      tbody.innerHTML = '<tr><td colspan="8" class="text-center text-muted py-4">No hay movimientos registrados.</td></tr>';
      return;
    }

    renderizarTablaHistorialFiltrada();
  } catch (error) {
    console.error('Error en historial:', error);
    tbody.innerHTML = `<tr><td colspan="8" class="text-center text-danger py-4"><i class="fa-solid fa-circle-exclamation me-1"></i>Error al cargar historial: ${escaparHtml(error.message)}</td></tr>`;
  }
}

function renderizarTablaHistorialFiltrada() {
  const tbody = document.getElementById('tabla-historial-body');
  if (!tbody) return;

  const movimientos = estadoApp.movimientos || [];
  const filtroTexto = (document.getElementById('filtro-historial-texto')?.value || '').toLowerCase().trim();
  const filtroTipo = (document.getElementById('filtro-historial-tipo')?.value || '').toUpperCase().trim();

  const filtrados = movimientos.filter(m => {
    if (filtroTipo && String(m.tipo).toUpperCase() !== filtroTipo) return false;
    if (filtroTexto) {
      const matchP = (m.producto || '').toLowerCase().includes(filtroTexto);
      const matchL = (m.numero_lote || '').toLowerCase().includes(filtroTexto);
      const matchA = (m.almacen || m['almacén'] || '').toLowerCase().includes(filtroTexto);
      const matchU = (m.usuario || '').toLowerCase().includes(filtroTexto);
      const matchObs = (m.observacion || '').toLowerCase().includes(filtroTexto);
      if (!matchP && !matchL && !matchA && !matchU && !matchObs) return false;
    }
    return true;
  });

  if (filtrados.length === 0) {
    tbody.innerHTML = '<tr><td colspan="8" class="text-center text-muted py-4">No se encontraron movimientos con los filtros seleccionados.</td></tr>';
    return;
  }

  tbody.innerHTML = filtrados.map(m => {
    const fechaFormateada = formatearFechaHoraAuditoria(m.fecha);
    const tipoUpper = String(m.tipo || 'ENTRADA').toUpperCase();
    const esEntrada = tipoUpper === 'ENTRADA';

    const badgeTipo = esEntrada
      ? '<span class="badge bg-success py-1.5 px-2.5 rounded-pill" title="Ingreso de mercancía al almacén" data-tooltip="Ingreso de mercancía (+)"><i class="fa-solid fa-arrow-down me-1"></i>ENTRADA</span>'
      : '<span class="badge bg-danger py-1.5 px-2.5 rounded-pill" title="Salida o despacho de mercancía" data-tooltip="Salida / Despacho (-)"><i class="fa-solid fa-arrow-up me-1"></i>SALIDA</span>';

    const nombreUsuario = m.usuario || 'Administrador';
    const rolUsuario = m.rol_usuario || (String(nombreUsuario).toLowerCase().includes('operario') ? 'Operario' : 'Administrador');
    const esAdminRol = String(rolUsuario).toUpperCase().includes('ADMIN');

    const badgeRol = esAdminRol
      ? `<span class="badge bg-primary-subtle text-primary border border-primary-subtle ms-1" style="font-size: 0.68rem;">Administrador</span>`
      : `<span class="badge bg-success-subtle text-success border border-success-subtle ms-1" style="font-size: 0.68rem;">Operario</span>`;

    const obsTexto = m.observacion && String(m.observacion).trim()
      ? `<span class="small text-secondary d-inline-flex align-items-center gap-1"><i class="fa-solid fa-truck-field text-primary opacity-75"></i>${escaparHtml(m.observacion)}</span>`
      : `<span class="small text-muted fst-italic">${esEntrada ? 'Recepción estándar' : 'Despacho operativo'}</span>`;

    return `
      <tr>
        <td class="ps-3 ps-md-4"><small class="text-dark fw-semibold font-monospace">${escaparHtml(fechaFormateada)}</small></td>
        <td class="text-center">${badgeTipo}</td>
        <td class="fw-bold text-dark">${escaparHtml(m.producto || 'N/A')}</td>
        <td>
          <span class="badge bg-light text-dark border font-monospace" title="Ver detalles del lote ${escaparHtml(m.numero_lote || 'N/A')}" data-tooltip="Lote: ${escaparHtml(m.numero_lote || 'N/A')}">
            ${escaparHtml(m.numero_lote || 'N/A')}
          </span>
        </td>
        <td>${obsTexto}</td>
        <td>${escaparHtml(m.almacen || m['almacén'] || 'N/A')}</td>
        <td class="text-end fw-bold ${esEntrada ? 'text-success' : 'text-danger'}">
          ${esEntrada ? '+' : '-'}${m.cantidad} uds
        </td>
        <td class="pe-3 pe-md-4">
          <div class="d-flex align-items-center flex-wrap gap-1">
            <span class="small fw-bold text-dark"><i class="fa-solid fa-user-check me-1 text-secondary"></i>${escaparHtml(nombreUsuario)}</span>
            ${badgeRol}
          </div>
        </td>
      </tr>
    `;
  }).join('');
}

// ============================================================================
// 5. GESTIÓN DE USUARIOS (SOLO ADMIN) CON TOOLTIPS UI
// ============================================================================
async function cargarUsuarios() {
  const tbody = document.getElementById('tbody-usuarios');
  if (!tbody) return;

  try {
    const res = await fetchAutenticado('/api/usuarios');
    const usuarios = res.usuarios || res.data || [];

    if (usuarios.length === 0) {
      tbody.innerHTML = '<tr><td colspan="6" class="text-center py-4 text-muted">No hay usuarios registrados.</td></tr>';
      return;
    }

    tbody.innerHTML = usuarios.map(u => {
      const esAdminPrincipal = Number(u.id_usuario) === 1 || u.email === 'admin@almacen.com';
      return `
        <tr>
          <td class="ps-3 ps-md-4 font-monospace fw-bold text-secondary">#${u.id_usuario}</td>
          <td class="fw-semibold text-dark">${escaparHtml(u.nombre)}</td>
          <td class="font-monospace text-muted">${escaparHtml(u.email)}</td>
          <td class="text-center">
            <span class="badge ${u.rol === 'ADMIN' ? 'bg-danger' : 'bg-success'} py-1 px-2.5 rounded-pill">
              ${escaparHtml(u.rol || 'OPERARIO')}
            </span>
          </td>
          <td class="text-center">
            <span class="badge bg-success-subtle text-success border border-success-subtle py-1 px-2.5 rounded-pill">Activo</span>
          </td>
          <td class="text-center pe-3 pe-md-4">
            ${esAdminPrincipal 
              ? `<span class="badge bg-secondary-subtle text-secondary border px-2 py-1 small"
                       title="Administrador Principal protegido"
                       data-tooltip="Administrador Principal protegido">
                   <i class="fa-solid fa-lock me-1"></i> Protegido
                 </span>`
              : `<button class="btn btn-sm btn-outline-danger px-2.5 py-1 rounded-2 shadow-xs d-inline-flex align-items-center gap-1" 
                         onclick="eliminarUsuario(${u.id_usuario})" 
                         title="Eliminar usuario"
                         data-tooltip="Eliminar usuario">
                   <i class="fa-solid fa-trash"></i>
                   <span>Eliminar</span>
                 </button>`
            }
          </td>
        </tr>
      `;
    }).join('');
  } catch (error) {
    console.error('Error al cargar usuarios:', error);
    tbody.innerHTML = `<tr><td colspan="6" class="text-center py-4 text-danger">Error: ${escaparHtml(error.message)}</td></tr>`;
  }
}

/**
 * Elimina un usuario por ID consumiendo DELETE /api/usuarios/:id
 * Solicita confirmación nativa al usuario antes de proceder.
 */
async function eliminarUsuario(idUsuario) {
  const idNum = parseInt(idUsuario, 10);
  if (isNaN(idNum) || idNum === 1) {
    alert('El usuario Administrador principal no puede ser eliminado.');
    return;
  }

  // 1. Confirmación nativa exigida
  const confirmacion = confirm('¿Estás seguro de eliminar este usuario?');
  if (!confirmacion) return;

  try {
    // 2. Consumir endpoint DELETE del backend
    const res = await fetchAutenticado(`/api/usuarios/${idNum}`, {
      method: 'DELETE',
    });

    if (res.exito || res.success) {
      if (typeof Swal !== 'undefined') {
        Swal.fire({
          icon: 'success',
          title: 'Usuario Eliminado',
          text: res.mensaje || 'El usuario ha sido eliminado correctamente.',
          timer: 1600,
          showConfirmButton: false,
        });
      }
      // 3. Actualizar dinámicamente la tabla sin recargar la página
      await cargarUsuarios();
      await cargarLogsAuditoria();
    } else {
      throw new Error(res.mensaje || 'No se pudo eliminar el usuario.');
    }
  } catch (error) {
    console.error('Error al eliminar usuario:', error);
    if (typeof Swal !== 'undefined') {
      Swal.fire({
        icon: 'error',
        title: 'Error',
        text: error.message || 'No se pudo completar la eliminación del usuario.',
      });
    } else {
      alert('Error: ' + error.message);
    }
  }
}

// Exponer la función al ámbito global para los botones con onclick
window.eliminarUsuario = eliminarUsuario;

// ============================================================================
// 5.1 MÓDULO DE REGISTRO DE AUDITORÍA DE ACTIVIDAD (ACTIVITY LOGS - ADMIN)
// ============================================================================
function obtenerBadgeAccionAuditoria(accion) {
  const act = String(accion || '').toUpperCase();
  if (act === 'CREAR_PRODUCTO') {
    return '<span class="badge bg-primary-subtle text-primary border border-primary-subtle py-1 px-2.5 rounded-pill font-monospace"><i class="fa-solid fa-box-open me-1"></i>CREAR_PRODUCTO</span>';
  }
  if (act === 'MODIFICAR_PRECIO' || act === 'MODIFICAR_PRODUCTO') {
    return `<span class="badge bg-warning-subtle text-warning-emphasis border border-warning-subtle py-1 px-2.5 rounded-pill font-monospace"><i class="fa-solid fa-tags me-1"></i>${escaparHtml(act)}</span>`;
  }
  if (act === 'CREAR_USUARIO') {
    return '<span class="badge bg-success-subtle text-success border border-success-subtle py-1 px-2.5 rounded-pill font-monospace"><i class="fa-solid fa-user-plus me-1"></i>CREAR_USUARIO</span>';
  }
  if (act === 'ELIMINAR_USUARIO') {
    return '<span class="badge bg-danger-subtle text-danger border border-danger-subtle py-1 px-2.5 rounded-pill font-monospace"><i class="fa-solid fa-user-xmark me-1"></i>ELIMINAR_USUARIO</span>';
  }
  return `<span class="badge bg-secondary-subtle text-secondary border py-1 px-2.5 rounded-pill font-monospace"><i class="fa-solid fa-shield-halved me-1"></i>${escaparHtml(act || 'ACCION_SISTEMA')}</span>`;
}

async function cargarLogsAuditoria() {
  const tbody = document.getElementById('tbody-logs-auditoria');
  if (!tbody) return;

  const rol = (estadoApp.usuario?.rol || localStorage.getItem('rol') || '').toUpperCase();
  if (rol !== 'ADMIN') return;

  try {
    const params = new URLSearchParams();
    const filtroFecha = document.getElementById('filtro-auditoria-fecha')?.value;
    const filtroAccion = document.getElementById('filtro-auditoria-accion')?.value;
    const filtroUsuario = document.getElementById('filtro-auditoria-usuario')?.value?.trim();

    if (filtroFecha) params.set('fecha', filtroFecha);
    if (filtroAccion && filtroAccion !== 'TODOS') params.set('accion', filtroAccion);
    if (filtroUsuario) params.set('usuario', filtroUsuario);

    const queryString = params.toString() ? `?${params.toString()}` : '';
    const res = await fetchAutenticado(`/api/auditoria${queryString}`);
    estadoApp.logsAuditoria = res.logs || res.data || [];
    renderizarTablaLogsAuditoria();
  } catch (error) {
    console.error('Error al cargar logs de auditoría:', error);
    tbody.innerHTML = `<tr><td colspan="6" class="text-center py-4 text-danger">Error al cargar auditoría: ${escaparHtml(error.message)}</td></tr>`;
  }
}

function renderizarTablaLogsAuditoria() {
  const tbody = document.getElementById('tbody-logs-auditoria');
  if (!tbody) return;

  const textoFiltro = (document.getElementById('filtro-auditoria-usuario')?.value || '').toLowerCase().trim();
  const accionFiltro = document.getElementById('filtro-auditoria-accion')?.value || 'TODOS';
  const fechaFiltro = document.getElementById('filtro-auditoria-fecha')?.value || '';

  const filtrados = (estadoApp.logsAuditoria || []).filter(log => {
    const coincideAccion = accionFiltro === 'TODOS' || String(log.accion).toUpperCase() === accionFiltro;
    const coincideTexto = !textoFiltro ||
      (log.usuario_nombre || log.usuario || '').toLowerCase().includes(textoFiltro) ||
      (log.usuario_email || log.email_usuario || '').toLowerCase().includes(textoFiltro) ||
      (log.detalles || '').toLowerCase().includes(textoFiltro) ||
      (log.ip_origen || '').toLowerCase().includes(textoFiltro);

    let coincideFecha = true;
    if (fechaFiltro && log.fecha_hora) {
      const d = new Date(log.fecha_hora);
      if (!isNaN(d.getTime())) {
        const pad = (n) => String(n).padStart(2, '0');
        const fechaLocal = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
        coincideFecha = fechaLocal === fechaFiltro;
      }
    }

    return coincideAccion && coincideTexto && coincideFecha;
  });

  if (filtrados.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="6" class="text-center py-5 text-muted">
          <i class="fa-solid fa-clipboard-check fs-3 d-block mb-2 opacity-50"></i>
          No se encontraron registros de auditoría para los filtros seleccionados.
        </td>
      </tr>
    `;
    return;
  }

  tbody.innerHTML = filtrados.map(log => {
    const fechaFormateada = formatearFechaHoraAuditoria(log.fecha_hora);
    const badgeAccion = obtenerBadgeAccionAuditoria(log.accion);
    const nombreUsuario = log.usuario_nombre || log.usuario || 'Administrador del Sistema';
    const emailUsuario = log.usuario_email || log.email_usuario || (log.id_usuario ? `ID #${log.id_usuario}` : 'Sistema');

    return `
      <tr>
        <td class="ps-3 ps-md-4 font-monospace fw-bold text-secondary">#${log.id_log}</td>
        <td><small class="text-dark fw-semibold font-monospace">${escaparHtml(fechaFormateada)}</small></td>
        <td>
          <div class="d-flex flex-column">
            <span class="fw-bold text-dark small"><i class="fa-solid fa-user-shield text-danger me-1"></i>${escaparHtml(nombreUsuario)}</span>
            <small class="text-muted font-monospace" style="font-size: 0.72rem;">${escaparHtml(emailUsuario)}</small>
          </div>
        </td>
        <td class="text-center">${badgeAccion}</td>
        <td>
          <span class="small text-dark">${escaparHtml(log.detalles || 'Sin detalles adicionales')}</span>
        </td>
        <td class="text-center pe-3 pe-md-4">
          <span class="badge bg-light text-dark border font-monospace">${escaparHtml(log.ip_origen || '127.0.0.1')}</span>
        </td>
      </tr>
    `;
  }).join('');
}

window.cargarLogsAuditoria = cargarLogsAuditoria;

// ============================================================================
// 6. INDICADOR VISUAL DE CARGA EN EXPORTACIONES (EXCEL / PDF)
// ============================================================================
function mostrarToastExportacion(mostrar, titulo = 'Generando reporte, por favor espere...', subtitulo = 'Procesando datos consolidados de almacén y auditoría') {
  const toastEl = document.getElementById('wms-export-toast');
  const titleEl = document.getElementById('wms-export-toast-title');
  const subEl = document.getElementById('wms-export-toast-subtitle');

  if (titleEl) titleEl.textContent = titulo;
  if (subEl) subEl.textContent = subtitulo;

  if (toastEl) {
    if (mostrar) {
      toastEl.classList.add('show');
    } else {
      toastEl.classList.remove('show');
    }
  }
}

async function exportarReporteWMS(tipoReporte = 'inventario', formato = 'excel', botonEl = null) {
  const htmlOriginal = botonEl ? botonEl.innerHTML : '';

  try {
    // 1. Deshabilitar botón temporalmente y mostrar spinner
    if (botonEl) {
      botonEl.disabled = true;
      botonEl.innerHTML = '<span class="spinner-border spinner-border-sm me-1" role="status"></span><span>Generando...</span>';
    }

    // 2. Mostrar indicador visual de carga (Toast flotante)
    mostrarToastExportacion(
      true,
      'Generando reporte, por favor espere...',
      formato === 'excel'
        ? 'Construyendo libro Excel (.xlsx) con trazabilidad completa...'
        : 'Preparando documento PDF de auditoría...'
    );

    // Pausa breve para asegurar feedback visual fluido en interfaz
    await new Promise(resolve => setTimeout(resolve, 450));

    if (formato === 'excel') {
      const endpoint = tipoReporte === 'historial'
        ? '/api/reportes/historial/excel'
        : '/api/reportes/excel';

      const token = estadoApp.token || localStorage.getItem('token');
      const headers = token ? { 'Authorization': `Bearer ${token}` } : {};

      const response = await fetch(`${API_BASE_URL}${endpoint}`, { headers });
      if (response.status === 401) {
        localStorage.clear();
        window.location.href = 'login.html';
        throw new Error('Sesión expirada');
      }
      if (!response.ok) {
        throw new Error(`No se pudo generar el archivo Excel (${response.status})`);
      }

      const blob = await response.blob();
      const urlBlob = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      const fechaHoy = new Date().toISOString().split('T')[0];
      a.href = urlBlob;
      a.download = tipoReporte === 'historial'
        ? `Reporte_Auditoria_Kardex_${fechaHoy}.xlsx`
        : `Reporte_Inventario_WMS_${fechaHoy}.xlsx`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(urlBlob);
    } else {
      // Exportación a vista PDF / Impresión corporativa
      generarReportePDFImprimible(tipoReporte);
    }

    mostrarToastExportacion(false);

    if (typeof Swal !== 'undefined') {
      Swal.fire({
        toast: true,
        position: 'top-end',
        icon: 'success',
        title: 'Reporte generado correctamente',
        showConfirmButton: false,
        timer: 2200,
      });
    }
  } catch (error) {
    console.error('Error al exportar reporte:', error);
    mostrarToastExportacion(false);
    if (typeof Swal !== 'undefined') {
      Swal.fire({
        icon: 'error',
        title: 'Error al generar el reporte',
        text: error.message || 'No fue posible completar la exportación.',
      });
    }
  } finally {
    if (botonEl) {
      botonEl.disabled = false;
      botonEl.innerHTML = htmlOriginal;
    }
  }
}

function generarReportePDFImprimible(tipoReporte) {
  const fechaActual = formatearFechaHoraAuditoria(new Date());
  const usuarioActual = `${estadoApp.usuario?.nombre || 'Usuario'} (${estadoApp.usuario?.rol || 'OPERARIO'})`;

  let titulo = 'Reporte Consolidado de Inventario y Lotes (FEFO)';
  let tablaHtml = '';

  if (tipoReporte === 'historial') {
    titulo = 'Historial Auditado de Movimientos (Kardex WMS)';
    const filas = (estadoApp.movimientos || []).map(m => `
      <tr>
        <td>${escaparHtml(formatearFechaHoraAuditoria(m.fecha))}</td>
        <td><strong>${escaparHtml(m.tipo)}</strong></td>
        <td>${escaparHtml(m.producto || 'N/A')}</td>
        <td>${escaparHtml(m.numero_lote || 'N/A')}</td>
        <td>${escaparHtml(m.observacion || '-')}</td>
        <td>${escaparHtml(m.almacen || 'N/A')}</td>
        <td style="text-align:right;font-weight:bold;">${String(m.tipo).toUpperCase() === 'ENTRADA' ? '+' : '-'}${m.cantidad} uds</td>
        <td>${escaparHtml(m.usuario || 'Sistema')} (${escaparHtml(m.rol_usuario || 'Administrador')})</td>
      </tr>
    `).join('');

    tablaHtml = `
      <table>
        <thead>
          <tr>
            <th>Fecha / Hora</th>
            <th>Tipo</th>
            <th>Producto</th>
            <th>Lote</th>
            <th>Proveedor / Trazabilidad</th>
            <th>Almacén</th>
            <th>Cantidad</th>
            <th>Usuario Responsable (Rol)</th>
          </tr>
        </thead>
        <tbody>${filas || '<tr><td colspan="8">Sin registros</td></tr>'}</tbody>
      </table>
    `;
  } else {
    const items = estadoApp.inventario || [];
    const filas = items.map(i => {
      const estadoFefoStr = obtenerTextoEstadoFefo(i.fecha_vencimiento, i.dias_para_vencer);
      return `
      <tr>
        <td>${escaparHtml(i.almacen || i.nombre_almacen || 'N/A')}</td>
        <td>${escaparHtml(i.codigo_barras || 'N/A')}</td>
        <td><strong>${escaparHtml(i.nombre_producto || i.producto || 'N/A')}</strong></td>
        <td>${escaparHtml(i.numero_lote || 'N/A')}</td>
        <td>${escaparHtml((i.fecha_vencimiento || '').substring(0, 10))}</td>
        <td><strong>${escaparHtml(estadoFefoStr)}</strong></td>
        <td style="text-align:right;font-weight:bold;">${i.cantidad} uds</td>
      </tr>
    `;
    }).join('');

    tablaHtml = `
      <table>
        <thead>
          <tr>
            <th>Almacén</th>
            <th>Código SKU</th>
            <th>Producto</th>
            <th>Lote</th>
            <th>Vencimiento</th>
            <th>Estado FEFO</th>
            <th>Stock Disponible</th>
          </tr>
        </thead>
        <tbody>${filas || '<tr><td colspan="7">Sin registros</td></tr>'}</tbody>
      </table>
    `;
  }

  const ventana = window.open('', '_blank', 'width=1024,height=768');
  if (!ventana) {
    window.print();
    return;
  }

  ventana.document.write(`
    <!DOCTYPE html>
    <html lang="es">
    <head>
      <meta charset="UTF-8">
      <title>${titulo}</title>
      <style>
        body { font-family: Arial, sans-serif; color: #0f172a; margin: 24px; }
        .header { border-bottom: 2px solid #1d4ed8; padding-bottom: 12px; margin-bottom: 16px; display: flex; justify-content: space-between; align-items: flex-end; }
        h2 { margin: 0 0 4px 0; color: #0f172a; }
        .meta { font-size: 12px; color: #475569; }
        table { width: 100%; border-collapse: collapse; font-size: 12px; }
        th { background: #0f172a; color: #ffffff; text-align: left; padding: 8px; }
        td { border-bottom: 1px solid #cbd5e1; padding: 7px 8px; }
      </style>
    </head>
    <body>
      <div class="header">
        <div>
          <h2>SISTEMA DE ALMACEN - ${titulo}</h2>
          <div class="meta">Generado por: ${escaparHtml(usuarioActual)}</div>
        </div>
        <div class="meta">Fecha y Hora: ${escaparHtml(fechaActual)}</div>
      </div>
      ${tablaHtml}
      <script>
        window.onload = function() { window.print(); };
      <\/script>
    </body>
    </html>
  `);
  ventana.document.close();
}

window.exportarReporteWMS = exportarReporteWMS;

// ============================================================================
// 7. MODALES Y FORMULARIOS (CON PROVEEDOR / ORIGEN Y AUDITORÍA DE USUARIO)
// ============================================================================
function poblarSelectoresModalMovimiento() {
  const selAlm = document.getElementById('mov-id-almacen');
  const selProd = document.getElementById('mov-id-producto');

  if (selAlm) {
    selAlm.innerHTML = '<option value="">Seleccione el Almacén...</option>' +
      estadoApp.almacenes.map(a => `<option value="${a.id_almacen}">${escaparHtml(a.nombre)}</option>`).join('');
  }

  if (selProd) {
    selProd.innerHTML = '<option value="">Seleccione el Producto...</option>' +
      estadoApp.productos.map(p => `<option value="${p.id_producto}">${escaparHtml(p.nombre)} (${escaparHtml(p.codigo_barras)})</option>`).join('');
  }
}

function actualizarEtiquetaProveedorSegunTipo() {
  const esSalida = document.getElementById('tipo-salida')?.checked;
  const labelProv = document.getElementById('label-proveedor-origen');
  const inputProv = document.getElementById('mov-proveedor');

  if (labelProv && inputProv) {
    if (esSalida) {
      labelProv.innerHTML = '<i class="fa-solid fa-dolly me-1"></i> Destino / Área Solicitante (Opcional)';
      inputProv.placeholder = 'Ej: Despacho a Sucursal, Orden de Salida o Cliente (Opcional)...';
    } else {
      labelProv.innerHTML = '<i class="fa-solid fa-truck-field me-1"></i> Proveedor / Origen de la Mercancía';
      inputProv.placeholder = 'Seleccione o escriba el proveedor u origen (Opcional)...';
    }
  }
}

function abrirModalMovimientoPreseleccionado({ idAlmacen, idProducto, numeroLote }) {
  const selAlm = document.getElementById('mov-id-almacen');
  const selProd = document.getElementById('mov-id-producto');
  const inputLote = document.getElementById('mov-numero-lote');

  if (selAlm && idAlmacen) selAlm.value = idAlmacen;
  if (selProd && idProducto) selProd.value = idProducto;
  if (inputLote && numeroLote) inputLote.value = numeroLote;

  actualizarEtiquetaProveedorSegunTipo();

  const modalEl = document.getElementById('modal-movimiento-lote');
  if (modalEl) bootstrap.Modal.getOrCreateInstance(modalEl).show();
}

function configurarFormularios() {
  // Cambiar etiqueta de Proveedor / Destino según radio seleccionado
  const radioEntrada = document.getElementById('tipo-entrada');
  const radioSalida = document.getElementById('tipo-salida');
  if (radioEntrada) radioEntrada.addEventListener('change', actualizarEtiquetaProveedorSegunTipo);
  if (radioSalida) radioSalida.addEventListener('change', actualizarEtiquetaProveedorSegunTipo);

  // 1. Formulario Movimiento de Stock (con proveedor, observacion e id_usuario)
  const formMov = document.getElementById('form-movimiento-lote');
  if (formMov) {
    formMov.addEventListener('submit', async (e) => {
      e.preventDefault();

      const tipo = document.querySelector('input[name="tipo_movimiento"]:checked')?.value || 'ENTRADA';
      const id_almacen = document.getElementById('mov-id-almacen')?.value;
      const id_producto = document.getElementById('mov-id-producto')?.value;
      const numero_lote = document.getElementById('mov-numero-lote')?.value?.trim();
      const fecha_vencimiento = document.getElementById('mov-fecha-vencimiento')?.value || null;
      const cantidad = parseInt(document.getElementById('mov-cantidad')?.value, 10);
      const proveedor = document.getElementById('mov-proveedor')?.value?.trim() || '';
      const observacion = document.getElementById('mov-observacion')?.value?.trim() || '';
      const id_usuario = estadoApp.usuario?.id_usuario || 1;

      try {
        const respuesta = await fetchAutenticado('/api/movimientos', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            tipo,
            id_almacen,
            id_producto,
            numero_lote,
            fecha_vencimiento,
            cantidad,
            proveedor,
            observacion,
            id_usuario,
          }),
        });

        Swal.fire({
          icon: 'success',
          title: 'Operación Exitosa',
          text: respuesta.mensaje || 'Movimiento procesado y auditado correctamente.',
          timer: 2000,
          showConfirmButton: false,
        });

        formMov.reset();
        actualizarEtiquetaProveedorSegunTipo();
        bootstrap.Modal.getInstance(document.getElementById('modal-movimiento-lote'))?.hide();
        await cargarDatosIniciales();
        cargarHistorialMovimientos();
      } catch (err) {
        Swal.fire({ icon: 'error', title: 'Error en la Operación', text: err.message });
      }
    });
  }

  // 2. Formulario Nuevo Producto (ADMIN)
  const formProd = document.getElementById('form-nuevo-producto');
  if (formProd) {
    formProd.addEventListener('submit', async (e) => {
      e.preventDefault();

      const codigo_barras = document.getElementById('prod-codigo')?.value?.trim();
      const nombre = document.getElementById('prod-nombre')?.value?.trim();
      const descripcion = document.getElementById('prod-descripcion')?.value?.trim();
      const precio_costo = parseFloat(document.getElementById('prod-precio-costo')?.value);
      const precio_venta = parseFloat(document.getElementById('prod-precio-venta')?.value);
      const stock_minimo = parseInt(document.getElementById('prod-stock-minimo')?.value ?? '10', 10);

      try {
        const res = await fetchAutenticado('/api/productos', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ codigo_barras, nombre, descripcion, precio_costo, precio_venta, stock_minimo }),
        });

        Swal.fire({ icon: 'success', title: 'Producto Creado', text: res.mensaje || 'Producto registrado.', timer: 2000, showConfirmButton: false });
        formProd.reset();
        bootstrap.Modal.getInstance(document.getElementById('modal-nuevo-producto'))?.hide();
        await cargarDatosIniciales();
        await cargarLogsAuditoria();
      } catch (err) {
        Swal.fire({ icon: 'error', title: 'Error al Registrar', text: err.message });
      }
    });
  }

  // 3. Formulario Nuevo Usuario (ADMIN)
  const formUsr = document.getElementById('form-nuevo-usuario');
  if (formUsr) {
    formUsr.addEventListener('submit', async (e) => {
      e.preventDefault();

      const nombre = document.getElementById('usr-nombre')?.value?.trim();
      const email = document.getElementById('usr-email')?.value?.trim();
      const password = document.getElementById('usr-password')?.value;
      const id_rol = parseInt(document.getElementById('usr-rol')?.value, 10);

      try {
        const res = await fetchAutenticado('/api/usuarios', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ nombre, email, password, id_rol }),
        });

        Swal.fire({ icon: 'success', title: 'Usuario Registrado', text: res.mensaje || 'Usuario creado.', timer: 2000, showConfirmButton: false });
        formUsr.reset();
        bootstrap.Modal.getInstance(document.getElementById('modal-nuevo-usuario'))?.hide();
        cargarUsuarios();
        cargarLogsAuditoria();
      } catch (err) {
        Swal.fire({ icon: 'error', title: 'Error al Registrar Usuario', text: err.message });
      }
    });
  }
}

// ============================================================================
// 8. PROTECCIÓN DE CLIENTE Y EVENTOS
// ============================================================================
function configurarEventosYProteccion() {
  // Conectar botones rápidos de operario
  const btnEntrada = document.getElementById('btn-operario-entrada');
  if (btnEntrada) {
    btnEntrada.addEventListener('click', () => {
      const radio = document.getElementById('tipo-entrada');
      if (radio) radio.checked = true;
      actualizarEtiquetaProveedorSegunTipo();
      bootstrap.Modal.getOrCreateInstance(document.getElementById('modal-movimiento-lote'))?.show();
    });
  }

  const btnSalida = document.getElementById('btn-operario-salida');
  if (btnSalida) {
    btnSalida.addEventListener('click', () => {
      const radio = document.getElementById('tipo-salida');
      if (radio) radio.checked = true;
      actualizarEtiquetaProveedorSegunTipo();
      bootstrap.Modal.getOrCreateInstance(document.getElementById('modal-movimiento-lote'))?.show();
    });
  }

  // Evento de pestañas Bootstrap
  document.querySelectorAll('button[data-bs-toggle="tab"]').forEach(btn => {
    btn.addEventListener('shown.bs.tab', (e) => {
      const target = e.target.getAttribute('data-bs-target');
      if (target === '#tab-historial') {
        cargarHistorialMovimientos();
      } else if (target === '#tab-gestion') {
        cargarUsuarios();
        cargarLogsAuditoria();
      }
    });
  });

  // Filtros de auditoría de actividad (Admin)
  const fAudUsuario = document.getElementById('filtro-auditoria-usuario');
  if (fAudUsuario) fAudUsuario.addEventListener('input', renderizarTablaLogsAuditoria);

  const fAudAccion = document.getElementById('filtro-auditoria-accion');
  if (fAudAccion) fAudAccion.addEventListener('change', () => cargarLogsAuditoria());

  const fAudFecha = document.getElementById('filtro-auditoria-fecha');
  if (fAudFecha) fAudFecha.addEventListener('change', () => cargarLogsAuditoria());

  // Filtros de historial
  const fTexto = document.getElementById('filtro-historial-texto');
  if (fTexto) fTexto.addEventListener('input', renderizarTablaHistorialFiltrada);

  const fTipo = document.getElementById('filtro-historial-tipo');
  if (fTipo) fTipo.addEventListener('change', renderizarTablaHistorialFiltrada);

  // Filtros de inventario
  const fStock = document.getElementById('filtro-buscar');
  if (fStock) fStock.addEventListener('input', renderizarTablaAlmacenActivo);

  const fFefo = document.getElementById('filtro-fefo');
  if (fFefo) fFefo.addEventListener('change', renderizarTablaAlmacenActivo);

  const btnRecargarStock = document.getElementById('btn-recargar-stock');
  if (btnRecargarStock) {
    btnRecargarStock.addEventListener('click', () => {
      cargarDatosIniciales();
    });
  }

  // Protección cliente pestaña gestión
  const tabGestBtn = document.getElementById('tab-gest-btn');
  if (tabGestBtn) {
    tabGestBtn.addEventListener('show.bs.tab', (e) => {
      const rol = (estadoApp.usuario?.rol || localStorage.getItem('rol') || '').toUpperCase();
      if (rol !== 'ADMIN') {
        e.preventDefault();
        Swal.fire({ icon: 'error', title: 'Acceso Denegado', text: 'Solo los administradores pueden gestionar el sistema.' });
      }
    });
  }
}

// ============================================================================
// 9. INICIALIZACIÓN AL CARGAR EL DOM
// ============================================================================
document.addEventListener('DOMContentLoaded', () => {
  if (!verificarYConfigurarSesion()) return;
  configurarLogout();
  configurarFormularios();
  configurarEventosYProteccion();
  cargarDatosIniciales();
});
