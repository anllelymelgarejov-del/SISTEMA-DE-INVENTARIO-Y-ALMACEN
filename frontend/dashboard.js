/* Dashboard de solo lectura. Comparte la sesión y el helper de app.js. */
(() => {
  'use strict';
  const state = { data: null, loading: false };
  const number = new Intl.NumberFormat('es-PE');
  const $ = id => document.getElementById(id);
  const escape = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
  const amount = value => Number.isFinite(Number(value)) ? Number(value) : 0;
  const empty = (message, title = '', icon = 'fa-inbox') => `<div class="dash-empty"><i class="fa-solid ${escape(icon)}" aria-hidden="true"></i>${title ? `<strong class="dash-empty-title">${escape(title)}</strong><p class="dash-empty-description">${escape(message)}</p>` : escape(message)}</div>`;
  const dateLabel = value => {
    const date = new Date(value);
    return value && !Number.isNaN(date.getTime()) ? date.toLocaleString('es-PE', { timeZone: 'America/Lima', dateStyle: 'short', timeStyle: 'short' }) : 'Fecha no disponible';
  };
  function dayKey(value) {
    const date = new Date(value);
    if (!value || Number.isNaN(date.getTime())) return null;
    return new Intl.DateTimeFormat('sv-SE', { timeZone: 'America/Lima' }).format(date);
  }
  function rows(response, key) {
    const result = Array.isArray(response) ? response : response?.data ?? response?.[key];
    if (!Array.isArray(result)) throw new Error('La API devolvió un formato inesperado.');
    return result;
  }
  function render() {
    if (!state.data) return;
    const { warehouses, inventory, movements } = state.data;
    const id = $('dashboard-warehouse').value;
    const warehouse = warehouses.find(item => String(item.id_almacen) === id);
    const stock = inventory.filter(item => amount(item.cantidad) > 0 && (!id || String(item.id_almacen) === id));
    // La API de movimientos devuelve el nombre del almacén, no su ID.
    const recent = movements.filter(item => !id || item.almacen === warehouse?.nombre);
    const lots = new Map();
    stock.forEach(item => {
      const key = String(item.id_lote ?? `${item.id_producto}:${item.numero_lote}`);
      if (!lots.has(key)) lots.set(key, item);
    });
    const validDays = item => item.dias_para_vencer !== null && item.dias_para_vencer !== undefined && Number.isFinite(Number(item.dias_para_vencer));
    const soon = item => validDays(item) && amount(item.dias_para_vencer) >= 0 && amount(item.dias_para_vencer) <= 30;
    const expired = item => validDays(item) && amount(item.dias_para_vencer) < 0;
    $('dashboard-products').textContent = number.format(new Set(stock.map(item => item.id_producto)).size);
    $('dashboard-units').textContent = number.format(stock.reduce((sum, item) => sum + amount(item.cantidad), 0));
    $('dashboard-soon').textContent = number.format([...lots.values()].filter(soon).length);
    $('dashboard-expired').textContent = number.format([...lots.values()].filter(expired).length);
    renderMovements(recent);
    const totals = warehouses.filter(item => !id || String(item.id_almacen) === id).map(item => ({
      name: item.nombre,
      value: stock.filter(row => String(row.id_almacen) === String(item.id_almacen)).reduce((sum, row) => sum + amount(row.cantidad), 0),
    })).sort((a, b) => b.value - a.value);
    const total = totals.reduce((sum, item) => sum + item.value, 0);
    $('dashboard-stock-chart').innerHTML = total ? totals.map(item => `<div class="dash-stock-row"><div class="dash-stock-label"><span>${escape(item.name)}</span><strong>${number.format(item.value)} <span class="dash-muted">· ${number.format(Math.round(item.value / total * 100))}%</span></strong></div><div class="dash-track" aria-hidden="true"><div class="dash-fill" style="width:${item.value / total * 100}%"></div></div></div>`).join('') : empty('No hay unidades registradas para esta selección. Puedes elegir otro almacén o actualizar los datos.', 'Sin stock para distribuir', 'fa-boxes-stacked');
    const alerts = stock.filter(item => soon(item) || expired(item)).sort((a, b) => amount(a.dias_para_vencer) - amount(b.dias_para_vencer));
    $('dashboard-alert-count').textContent = `${number.format(alerts.length)} ubicaciones con lotes en alerta`;
    $('dashboard-alerts').innerHTML = alerts.length ? alerts.map(item => `<div class="dash-alert"><span class="dash-icon ${expired(item) ? 'danger' : 'warning'}"><i class="fa-solid fa-triangle-exclamation" aria-hidden="true"></i></span><div class="dash-alert-details"><strong>${escape(item.nombre_producto ?? item.producto)}</strong><div class="dash-muted">Lote ${escape(item.numero_lote)} · ${escape(item.nombre_almacen)} · ${number.format(amount(item.cantidad))} unidades</div><span class="dash-tag ${expired(item) ? 'expired' : 'soon'}">${expired(item) ? `Vencido hace ${number.format(-amount(item.dias_para_vencer))} días` : amount(item.dias_para_vencer) === 0 ? 'Vence hoy' : `Vence en ${number.format(amount(item.dias_para_vencer))} días`}</span></div></div>`).join('') : empty('No hay lotes vencidos ni próximos a vencer con existencias.');
    $('dashboard-movements').innerHTML = recent.length ? `<div class="table-responsive"><table class="table dash-table"><caption class="visually-hidden">Diez últimos movimientos de la selección, dentro de los últimos 100 registros disponibles</caption><thead><tr><th scope="col">Fecha</th><th scope="col">Tipo</th><th scope="col">Producto / lote</th><th scope="col">Almacén</th><th scope="col" class="text-end">Cantidad</th><th scope="col">Responsable</th></tr></thead><tbody>${recent.slice(0, 10).map(item => `<tr><td>${escape(dateLabel(item.fecha))}</td><td><span class="dash-tag ${item.tipo === 'SALIDA' ? 'out' : ''}">${escape(item.tipo)}</span></td><td><span class="fw-semibold">${escape(item.producto ?? 'Sin producto')}</span><div class="dash-muted">${escape(item.numero_lote ?? 'Sin lote')}</div></td><td>${escape(item.almacen ?? 'Sin almacén')}</td><td class="text-end fw-semibold">${number.format(amount(item.cantidad))}</td><td>${escape(item.usuario ?? 'Sistema')}</td></tr>`).join('')}</tbody></table></div>` : empty('No hay movimientos en los registros disponibles para esta selección.');
  }
  function renderMovements(movements) {
    const days = new Map();
    // Siete fechas de calendario en Lima; nunca se interpreta un día ausente como historial completo.
    const today = dayKey(new Date());
    const anchor = new Date(`${today}T12:00:00-05:00`);
    for (let offset = 6; offset >= 0; offset--) {
      const key = dayKey(new Date(anchor.getTime() - offset * 86400000));
      days.set(key, { input: 0, output: 0 });
    }
    let count = 0;
    movements.forEach(item => {
      const day = days.get(dayKey(item.fecha));
      if (!day || !['ENTRADA', 'SALIDA'].includes(item.tipo)) return;
      day[item.tipo === 'ENTRADA' ? 'input' : 'output'] += amount(item.cantidad);
      count++;
    });
    const maximum = Math.max(1, ...[...days.values()].flatMap(item => [item.input, item.output]));
    $('dashboard-flow-chart').innerHTML = count ? `<div class="dash-columns">${[...days].map(([key, item]) => `<div class="dash-day"><div class="dash-bar-pair" role="img" aria-label="${key}: ${number.format(item.input)} unidades de entrada, ${number.format(item.output)} unidades de salida"><div class="dash-bar" style="height:${item.input / maximum * 100}%" title="Entradas: ${number.format(item.input)}"></div><div class="dash-bar out" style="height:${item.output / maximum * 100}%" title="Salidas: ${number.format(item.output)}"></div></div><span class="dash-day-label">${key.slice(8)}/${key.slice(5, 7)}</span></div>`).join('')}</div><div class="dash-legend"><span><span class="dash-dot"></span>Entradas</span><span><span class="dash-dot out"></span>Salidas</span></div>` : empty('No se encontraron entradas ni salidas de los últimos 7 días entre los registros disponibles. Prueba con otro almacén o actualiza los datos.', 'Sin movimientos recientes', 'fa-chart-column');
    const input = [...days.values()].reduce((sum, day) => sum + day.input, 0);
    const output = [...days.values()].reduce((sum, day) => sum + day.output, 0);
    $('dashboard-flow-summary').textContent = `${number.format(input)} unidades de entrada · ${number.format(output)} unidades de salida`;
  }
  async function load() {
    if (state.loading) return;
    state.loading = true;
    const status = $('dashboard-status');
    const refresh = $('dashboard-refresh');
    status.hidden = false;
    status.className = 'dash-status';
    status.textContent = 'Cargando datos reales del inventario y los movimientos…';
    $('dashboard-content').setAttribute('aria-busy', 'true');
    refresh.disabled = true;
    refresh.innerHTML = '<i class="fa-solid fa-spinner fa-spin" aria-hidden="true"></i> Actualizando';
    try {
      const responses = await Promise.all(['/api/almacenes', '/api/inventario', '/api/movimientos'].map(url => fetchAutenticado(url)));
      const data = { warehouses: rows(responses[0], 'almacenes'), inventory: rows(responses[1], 'inventario'), movements: rows(responses[2], 'movimientos').slice(0, 100) };
      data.movements.sort((a, b) => (new Date(b.fecha).getTime() || 0) - (new Date(a.fecha).getTime() || 0));
      const selected = $('dashboard-warehouse').value;
      $('dashboard-warehouse').innerHTML = '<option value="">Todos los almacenes</option>' + data.warehouses.map(item => `<option value="${escape(item.id_almacen)}">${escape(item.nombre)}</option>`).join('');
      if (data.warehouses.some(item => String(item.id_almacen) === selected)) $('dashboard-warehouse').value = selected;
      state.data = data;
      render();
      $('dashboard-content').hidden = false;
      $('dashboard-updated').textContent = `Actualizado: ${dateLabel(new Date())}`;
      status.hidden = true;
    } catch (error) {
      status.className = 'dash-status error';
      status.textContent = `No se pudo actualizar el dashboard. ${state.data ? 'Se conservan los datos de la última actualización. ' : 'No hay datos disponibles para mostrar. '}Usa Actualizar para reintentar.`;
      console.error('Error al cargar dashboard:', error);
    } finally {
      state.loading = false;
      refresh.disabled = false;
      refresh.innerHTML = '<i class="fa-solid fa-rotate" aria-hidden="true"></i> Actualizar';
      $('dashboard-content').setAttribute('aria-busy', 'false');
    }
  }
  document.addEventListener('DOMContentLoaded', () => {
    if (!estadoApp.token) return;
    $('dashboard-refresh').addEventListener('click', load);
    $('dashboard-warehouse').addEventListener('change', render);
    $('tab-dashboard-btn').addEventListener('shown.bs.tab', load);
    // Se carga al entrar en la pestaña para no duplicar las consultas iniciales del inventario.
  });
})();
