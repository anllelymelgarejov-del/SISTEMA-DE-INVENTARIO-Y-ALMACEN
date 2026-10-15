/**
 * ============================================================================
 * SISTEMA DE INVENTARIO Y ALMACENES - CONTROLADOR FRONTEND (APP.JS)
 * ============================================================================
 * 1. Autenticación y control de accesos por rol (ADMIN vs OPERARIO).
 * 2. Visualización segmentada de stock por pestañas de cada Almacén.
 * 3. Historial de movimientos auditado (Kardex) con filtros y badges.
 * 4. Modal único para registrar Entrada (+) y Salida (-) por Lote.
 * 5. Gestión de catálogo de productos y usuarios (exclusivo ADMIN).
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
  idAlmacenActivo: null,
};

// ============================================================================
// 1. HELPER FETCH AUTENTICADO
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

  estadoApp.usuario = { nombre, rol, email: usuarioGuardado?.email || '' };

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
// 3. CARGA DE DATOS PRINCIPALES
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
                type="button">
          <i class="fa-solid fa-warehouse"></i>
          <span>${alm.nombre}</span>
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
    if (elCodigo) elCodigo.textContent = `ALM-${almacenActivo.id_almacen}`;
    if (elDir) elDir.textContent = almacenActivo.direccion || 'Sede Principal';
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
      const dias = calcularDiasParaVencer(item.fecha_vencimiento);
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
    const badgeFefo = obtenerBadgeFefo(item.fecha_vencimiento);
    const fechaVenc = item.fecha_vencimiento ? item.fecha_vencimiento.substring(0, 10) : 'N/A';
    const nombreProd = item.nombre_producto || item.producto || item.producto_nombre || 'N/A';
    return `
      <tr>
        <td class="ps-3 ps-md-4">
          <div class="fw-bold text-dark">${nombreProd}</div>
          <small class="text-muted">${item.descripcion || ''}</small>
        </td>
        <td><span class="badge bg-light text-dark font-monospace border">${item.codigo_barras || 'N/A'}</span></td>
        <td><span class="badge bg-light text-secondary font-monospace border">${item.numero_lote || 'N/A'}</span></td>
        <td class="small font-monospace">${fechaVenc}</td>
        <td class="text-end fw-bold fs-6 text-primary">${item.cantidad} uds</td>
        <td class="text-center">${badgeFefo}</td>
        <td class="text-center pe-3 pe-md-4">
          <button class="btn btn-sm btn-outline-primary py-1 px-2.5 rounded-3 btn-operar-item"
                  data-id-almacen="${item.id_almacen}"
                  data-id-producto="${item.id_producto}"
                  data-lote="${item.numero_lote || ''}"
                  title="Operar stock de este producto">
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
}

function calcularDiasParaVencer(fechaStr) {
  if (!fechaStr) return 9999;
  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0);
  const vence = new Date(fechaStr);
  vence.setHours(0, 0, 0, 0);
  return Math.ceil((vence - hoy) / (1000 * 60 * 60 * 24));
}

function obtenerBadgeFefo(fechaStr) {
  const dias = calcularDiasParaVencer(fechaStr);
  if (dias < 0) {
    return `<span class="badge badge-fefo-vencido py-1 px-2.5 rounded-pill"><i class="fa-solid fa-ban me-1"></i>Vencido</span>`;
  } else if (dias <= 30) {
    return `<span class="badge badge-fefo-critico py-1 px-2.5 rounded-pill"><i class="fa-solid fa-triangle-exclamation me-1"></i>Crítico (${dias}d)</span>`;
  } else if (dias <= 90) {
    return `<span class="badge badge-fefo-proximo py-1 px-2.5 rounded-pill"><i class="fa-solid fa-clock me-1"></i>Próximo (${dias}d)</span>`;
  } else {
    return `<span class="badge badge-fefo-optimo py-1 px-2.5 rounded-pill"><i class="fa-solid fa-circle-check me-1"></i>Óptimo</span>`;
  }
}

// ============================================================================
// 4. HISTORIAL DE MOVIMIENTOS (REQUERIMIENTO PRINCIPAL)
// ============================================================================

/**
 * Obtiene y renderiza el historial de movimientos mediante fetch('/api/movimientos')
 */
async function cargarHistorialMovimientos() {
  const tbody = document.getElementById('tabla-historial-body');
  if (!tbody) return;

  try {
    tbody.innerHTML = '<tr><td colspan="7" class="text-center text-muted py-4"><div class="spinner-border spinner-border-sm text-primary me-2"></div>Cargando historial de movimientos...</td></tr>';

    const token = localStorage.getItem('token');
    const headers = token ? { 'Authorization': `Bearer ${token}` } : {};

    const response = await fetch('/api/movimientos', { headers });

    if (!response.ok) {
      throw new Error(`Error en el servidor (${response.status}) al obtener el historial`);
    }

    const data = await response.json();
    const movimientos = Array.isArray(data) ? data : (data.data || []);
    estadoApp.movimientos = movimientos;

    if (!movimientos || movimientos.length === 0) {
      tbody.innerHTML = '<tr><td colspan="7" class="text-center text-muted py-4">No hay movimientos registrados.</td></tr>';
      return;
    }

    renderizarTablaHistorialFiltrada();
  } catch (error) {
    console.error('Error en historial:', error);
    tbody.innerHTML = `<tr><td colspan="7" class="text-center text-danger py-4"><i class="fa-solid fa-circle-exclamation me-1"></i>Error al cargar historial: ${error.message}</td></tr>`;
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
      if (!matchP && !matchL && !matchA && !matchU) return false;
    }
    return true;
  });

  if (filtrados.length === 0) {
    tbody.innerHTML = '<tr><td colspan="7" class="text-center text-muted py-4">No se encontraron movimientos con los filtros seleccionados.</td></tr>';
    return;
  }

  tbody.innerHTML = filtrados.map(m => {
    let fecha = m.fecha;
    try {
      if (m.fecha) fecha = new Date(m.fecha).toLocaleString('es-PE', { hour12: false });
    } catch (e) {
      fecha = m.fecha;
    }

    const esEntrada = String(m.tipo).toUpperCase() === 'ENTRADA';
    const badgeTipo = esEntrada
      ? '<span class="badge bg-success">📥 ENTRADA</span>'
      : '<span class="badge bg-danger">📤 SALIDA</span>';

    return `
      <tr>
        <td><small class="text-secondary font-monospace">${fecha}</small></td>
        <td class="text-center">${badgeTipo}</td>
        <td class="fw-bold">${m.producto || 'N/A'}</td>
        <td><span class="badge bg-light text-dark border font-monospace">${m.numero_lote || 'N/A'}</span></td>
        <td>${m.almacen || m['almacén'] || 'N/A'}</td>
        <td class="text-end fw-bold ${esEntrada ? 'text-success' : 'text-danger'}">
          ${esEntrada ? '+' : '-'}${m.cantidad} uds
        </td>
        <td><small class="text-secondary"><i class="fa-solid fa-user me-1"></i>${m.usuario || 'Sistema'}</small></td>
      </tr>
    `;
  }).join('');
}

// ============================================================================
// 5. GESTIÓN DE USUARIOS (SOLO ADMIN)
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
          <td class="fw-semibold text-dark">${u.nombre}</td>
          <td class="font-monospace text-muted">${u.email}</td>
          <td class="text-center">
            <span class="badge ${u.rol === 'ADMIN' ? 'bg-danger' : 'bg-success'} py-1 px-2.5 rounded-pill">
              ${u.rol || 'OPERARIO'}
            </span>
          </td>
          <td class="text-center">
            <span class="badge bg-success-subtle text-success border border-success-subtle py-1 px-2.5 rounded-pill">Activo</span>
          </td>
          <td class="text-center pe-3 pe-md-4">
            ${esAdminPrincipal 
              ? `<span class="badge bg-secondary-subtle text-secondary border px-2 py-1 small" title="Administrador Principal protegido">
                   <i class="fa-solid fa-lock me-1"></i> Protegido
                 </span>`
              : `<button class="btn btn-sm btn-outline-danger px-2.5 py-1 rounded-2 shadow-xs d-inline-flex align-items-center gap-1" 
                         onclick="eliminarUsuario(${u.id_usuario})" 
                         title="Eliminar usuario">
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
    tbody.innerHTML = `<tr><td colspan="6" class="text-center py-4 text-danger">Error: ${error.message}</td></tr>`;
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
// 6. MODALES Y FORMULARIOS
// ============================================================================
function poblarSelectoresModalMovimiento() {
  const selAlm = document.getElementById('mov-id-almacen');
  const selProd = document.getElementById('mov-id-producto');

  if (selAlm) {
    selAlm.innerHTML = '<option value="">Seleccione el Almacén...</option>' +
      estadoApp.almacenes.map(a => `<option value="${a.id_almacen}">${a.nombre}</option>`).join('');
  }

  if (selProd) {
    selProd.innerHTML = '<option value="">Seleccione el Producto...</option>' +
      estadoApp.productos.map(p => `<option value="${p.id_producto}">${p.nombre} (${p.codigo_barras})</option>`).join('');
  }
}

function abrirModalMovimientoPreseleccionado({ idAlmacen, idProducto, numeroLote }) {
  const selAlm = document.getElementById('mov-id-almacen');
  const selProd = document.getElementById('mov-id-producto');
  const inputLote = document.getElementById('mov-numero-lote');

  if (selAlm && idAlmacen) selAlm.value = idAlmacen;
  if (selProd && idProducto) selProd.value = idProducto;
  if (inputLote && numeroLote) inputLote.value = numeroLote;

  const modalEl = document.getElementById('modal-movimiento-lote');
  if (modalEl) bootstrap.Modal.getOrCreateInstance(modalEl).show();
}

function configurarFormularios() {
  // 1. Formulario Movimiento de Stock
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

      try {
        const respuesta = await fetchAutenticado('/api/movimientos', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ tipo, id_almacen, id_producto, numero_lote, fecha_vencimiento, cantidad }),
        });

        Swal.fire({
          icon: 'success',
          title: 'Operación Exitosa',
          text: respuesta.mensaje || 'Movimiento procesado correctamente.',
          timer: 2000,
          showConfirmButton: false,
        });

        formMov.reset();
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

      try {
        const res = await fetchAutenticado('/api/productos', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ codigo_barras, nombre, descripcion, precio_costo, precio_venta }),
        });

        Swal.fire({ icon: 'success', title: 'Producto Creado', text: res.mensaje || 'Producto registrado.', timer: 2000, showConfirmButton: false });
        formProd.reset();
        bootstrap.Modal.getInstance(document.getElementById('modal-nuevo-producto'))?.hide();
        await cargarDatosIniciales();
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
      } catch (err) {
        Swal.fire({ icon: 'error', title: 'Error al Registrar Usuario', text: err.message });
      }
    });
  }
}

// ============================================================================
// 7. PROTECCIÓN DE CLIENTE Y EVENTOS
// ============================================================================
function configurarEventosYProteccion() {
  // Conectar botones rápidos de operario
  const btnEntrada = document.getElementById('btn-operario-entrada');
  if (btnEntrada) {
    btnEntrada.addEventListener('click', () => {
      const radio = document.getElementById('tipo-entrada');
      if (radio) radio.checked = true;
      bootstrap.Modal.getOrCreateInstance(document.getElementById('modal-movimiento-lote'))?.show();
    });
  }

  const btnSalida = document.getElementById('btn-operario-salida');
  if (btnSalida) {
    btnSalida.addEventListener('click', () => {
      const radio = document.getElementById('tipo-salida');
      if (radio) radio.checked = true;
      bootstrap.Modal.getOrCreateInstance(document.getElementById('modal-movimiento-lote'))?.show();
    });
  }

  // Evento de pestañas Bootstrap
  document.querySelectorAll('button[data-bs-toggle="tab"]').forEach(btn => {
    btn.addEventListener('shown.bs.tab', (e) => {
      const target = e.target.getAttribute('data-bs-target');
      if (target === '#tab-historial') {
        cargarHistorialMovimientos();
      }
    });
  });

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
// 8. INICIALIZACIÓN AL CARGAR EL DOM
// ============================================================================
document.addEventListener('DOMContentLoaded', () => {
  if (!verificarYConfigurarSesion()) return;
  configurarLogout();
  configurarFormularios();
  configurarEventosYProteccion();
  cargarDatosIniciales();
});