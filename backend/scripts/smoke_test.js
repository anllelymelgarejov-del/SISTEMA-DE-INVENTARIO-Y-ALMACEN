#!/usr/bin/env node
'use strict';

const baseUrl = (process.env.SMOKE_BASE_URL || 'http://localhost:3000').replace(/\/$/, '');
const email = process.env.SMOKE_EMAIL || 'admin@almacen.com';
const password = process.env.SMOKE_PASSWORD || 'admin123';
const writeEnabled = process.argv.includes('--write');
const results = [];

async function request(path, options = {}) {
  return fetch(`${baseUrl}${path}`, {
    ...options,
    headers: { Accept: 'application/json', ...(options.headers || {}) },
  });
}

async function check(name, action) {
  try {
    const detail = await action();
    results.push({ name, passed: true, detail: detail || '' });
  } catch (error) {
    results.push({ name, passed: false, detail: error.message });
  }
}

function requireStatus(response, expected, label) {
  if (response.status !== expected) throw new Error(`${label}: esperado HTTP ${expected}, recibido ${response.status}`);
}

async function jsonBody(response) {
  try {
    return await response.json();
  } catch {
    throw new Error(`Respuesta JSON inválida (HTTP ${response.status}).`);
  }
}

function rows(body, ...keys) {
  if (Array.isArray(body)) return body;
  for (const key of keys) if (Array.isArray(body?.[key])) return body[key];
  throw new Error('La respuesta no contiene una lista de datos.');
}

async function main() {
  let token = null;
  let warehouses = [];
  let products = [];
  let inventory = [];

  await check('Login de administrador y obtención de JWT', async () => {
    const response = await request('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    requireStatus(response, 200, 'Login');
    const body = await jsonBody(response);
    token = body.token || body.data?.token;
    if (!token) throw new Error('El login no devolvió un token JWT.');
    return `sesión iniciada como ${email}`;
  });

  if (token) {
    const auth = { Authorization: `Bearer ${token}` };
    const fetchList = async (path, keys, label) => {
      const response = await request(path, { headers: auth });
      requireStatus(response, 200, label);
      return rows(await jsonBody(response), ...keys);
    };

    await check('GET /api/almacenes con token', async () => {
      warehouses = await fetchList('/api/almacenes', ['data', 'almacenes'], 'Almacenes');
      return `${warehouses.length} almacén(es)`;
    });
    await check('GET /api/productos con token', async () => {
      products = await fetchList('/api/productos', ['productos', 'data'], 'Productos');
      return `${products.length} producto(s)`;
    });
    await check('GET /api/inventario con token', async () => {
      inventory = await fetchList('/api/inventario', ['data', 'inventario'], 'Inventario');
      return `${inventory.length} combinación(es) producto/lote con stock`;
    });

    const protectedRoutes = [
      ['/api/usuarios', 'Gestión de usuarios'],
      ['/api/transferencias', 'Transferencias'],
      ['/api/reportes/excel', 'Reporte Excel'],
    ];
    for (const [path, label] of protectedRoutes) {
      await check(`${label}: GET autenticado responde 200`, async () => {
        const response = await request(path, { headers: auth });
        requireStatus(response, 200, label);
        await response.arrayBuffer();
        return path;
      });
      await check(`${label}: GET sin token responde 401`, async () => {
        const response = await request(path);
        requireStatus(response, 401, label);
        await response.arrayBuffer();
        return path;
      });
    }

    if (writeEnabled) {
      await check('Transferencia real de prueba (--write)', async () => {
        const source = warehouses.find(warehouse =>
          inventory.some(item => Number(item.id_almacen) === Number(warehouse.id_almacen) && Number(item.cantidad) > 0)
        );
        const destination = warehouses.find(warehouse => Number(warehouse.id_almacen) !== Number(source?.id_almacen));
        const stock = source && inventory.find(item => Number(item.id_almacen) === Number(source.id_almacen) && Number(item.cantidad) > 0);
        if (!source || !destination || !stock) {
          throw new Error('Se necesitan dos almacenes y al menos una línea de inventario con stock.');
        }
        const response = await request('/api/transferencias', {
          method: 'POST',
          headers: { ...auth, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            id_almacen_origen: source.id_almacen,
            id_almacen_destino: destination.id_almacen,
            observaciones: 'SMOKE_TEST --write',
            items: [{ producto_id: stock.id_producto, lote_id: stock.id_lote, cantidad: 1 }],
          }),
        });
        requireStatus(response, 201, 'Transferencia de prueba');
        const body = await jsonBody(response);
        return body.mensaje || 'transferencia de una unidad registrada';
      });
    }
  }

  const passed = results.filter(result => result.passed).length;
  const failed = results.length - passed;
  console.log(`\nSmoke test SGI Almacén Pro — ${baseUrl}${writeEnabled ? ' (--write habilitado)' : ''}`);
  for (const result of results) {
    console.log(`${result.passed ? '✅ PASS' : '❌ FAIL'}  ${result.name}${result.detail ? ` — ${result.detail}` : ''}`);
  }
  console.log(`\nResultado: ${passed} aprobada(s), ${failed} fallida(s).`);
  if (failed) process.exitCode = 1;
}

main().catch(error => {
  console.error(`No se pudo completar el smoke test: ${error.message}`);
  process.exitCode = 1;
});
