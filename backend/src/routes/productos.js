const express = require('express');
const router = express.Router();
const pool = require('../config/db');
const { verificarToken, verificarRol } = require('../middlewares/auth');
const { registrarAuditoria } = require('./auditoria');

/**
 * ============================================================================
 * RUTA SIMPLIFICADA DE PRODUCTOS
 * ============================================================================
 * Tabla: productos (id_producto, codigo_barras, nombre, descripcion, precio_costo, precio_venta)
 */

// Asegurar de forma transparente que la columna 'stock_minimo' exista en la tabla productos
let columnaStockMinimoProductosVerificada = false;
async function asegurarColumnaStockMinimoProductos() {
  if (columnaStockMinimoProductosVerificada) return;
  try {
    await pool.query('ALTER TABLE productos ADD COLUMN IF NOT EXISTS stock_minimo INT NOT NULL DEFAULT 10;');
    columnaStockMinimoProductosVerificada = true;
  } catch (_) {
    columnaStockMinimoProductosVerificada = true;
  }
}

// GET /api/productos - Obtener catálogo completo de productos
router.get('/', verificarToken, async (req, res) => {
  try {
    await asegurarColumnaStockMinimoProductos();

    const query = `
      SELECT 
        id_producto, 
        codigo_barras, 
        nombre, 
        descripcion, 
        precio_costo, 
        precio_venta,
        COALESCE(stock_minimo, 10) AS stock_minimo
      FROM productos 
      ORDER BY id_producto DESC;
    `;

    const resultado = await pool.query(query);

    return res.status(200).json({
      exito: true,
      success: true,
      total: resultado.rowCount,
      productos: resultado.rows,
      data: resultado.rows,
    });
  } catch (error) {
    console.error('Error al consultar catálogo de productos:', error);
    return res.status(500).json({
      exito: false,
      success: false,
      mensaje: 'Error de Servidor: ' + error.message,
      error: error.message,
    });
  }
});

// GET /api/productos/:id - Obtener un producto por ID
router.get('/:id', verificarToken, async (req, res) => {
  const idProd = parseInt(req.params.id, 10);
  if (isNaN(idProd) || idProd <= 0) {
    return res.status(400).json({ exito: false, mensaje: 'ID de producto inválido.' });
  }
  try {
    await asegurarColumnaStockMinimoProductos();

    const query = `
      SELECT 
        id_producto, 
        codigo_barras, 
        nombre, 
        descripcion, 
        precio_costo, 
        precio_venta,
        COALESCE(stock_minimo, 10) AS stock_minimo
      FROM productos 
      WHERE id_producto = $1;
    `;
    const resultado = await pool.query(query, [idProd]);

    if (resultado.rows.length === 0) {
      return res.status(404).json({
        exito: false,
        mensaje: 'Producto no encontrado.',
      });
    }

    return res.status(200).json({
      exito: true,
      data: resultado.rows[0],
      producto: resultado.rows[0],
    });
  } catch (error) {
    console.error('Error al consultar producto por ID:', error);
    return res.status(500).json({
      exito: false,
      mensaje: 'Error de Servidor: ' + error.message,
    });
  }
});

// POST /api/productos - Crear nuevo producto en el catálogo (Exclusivo ADMIN)
router.post('/', verificarToken, verificarRol('ADMIN'), async (req, res) => {
  const {
    codigo_barras,
    nombre,
    descripcion = null,
    precio_costo = 0,
    precio_venta = 0,
    stock_minimo = 10,
  } = req.body || {};

  // Validaciones básicas de entrada
  if (!codigo_barras || !nombre) {
    return res.status(400).json({
      exito: false,
      success: false,
      mensaje: 'Los campos codigo_barras y nombre son obligatorios.',
    });
  }

  const costoNum = parseFloat(precio_costo || 0);
  const ventaNum = parseFloat(precio_venta || 0);
  const stockMinNum = stock_minimo !== undefined && stock_minimo !== '' ? parseInt(stock_minimo, 10) : 10;

  if (isNaN(costoNum) || costoNum < 0 || isNaN(ventaNum) || ventaNum < 0 || isNaN(stockMinNum) || stockMinNum < 0) {
    return res.status(400).json({
      exito: false,
      success: false,
      mensaje: 'Los precios y el stock mínimo deben ser números válidos mayores o iguales a 0.',
    });
  }

  try {
    await asegurarColumnaStockMinimoProductos();

    const query = `
      INSERT INTO productos (
        codigo_barras, 
        nombre, 
        descripcion, 
        precio_costo, 
        precio_venta,
        stock_minimo
      ) VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING id_producto, codigo_barras, nombre, descripcion, precio_costo, precio_venta, stock_minimo;
    `;

    const valores = [
      String(codigo_barras).trim(),
      String(nombre).trim(),
      descripcion ? String(descripcion).trim() : null,
      costoNum,
      ventaNum,
      stockMinNum,
    ];

    const resultado = await pool.query(query, valores);
    const nuevoProducto = resultado.rows[0];

    await registrarAuditoria(
      req.user?.id_usuario || req.user?.id,
      'CREAR_PRODUCTO',
      `Producto creado: "${nuevoProducto.nombre}" (SKU: ${nuevoProducto.codigo_barras}, Costo: $${nuevoProducto.precio_costo}, Venta: $${nuevoProducto.precio_venta}, Stock Mín: ${nuevoProducto.stock_minimo})`,
      req
    );

    return res.status(201).json({
      exito: true,
      success: true,
      mensaje: 'Producto registrado correctamente.',
      producto: nuevoProducto,
      data: nuevoProducto,
    });
  } catch (error) {
    console.error('Error al registrar nuevo producto:', error);
    return res.status(500).json({
      exito: false,
      success: false,
      mensaje: 'Error de Servidor: ' + error.message,
      error: error.message,
    });
  }
});

// PUT /api/productos/:id - Actualizar producto / precios / stock mínimo (Exclusivo ADMIN)
router.put('/:id', verificarToken, verificarRol('ADMIN'), async (req, res) => {
  const idProd = parseInt(req.params.id, 10);
  if (isNaN(idProd) || idProd <= 0) {
    return res.status(400).json({ exito: false, success: false, mensaje: 'ID de producto inválido.' });
  }
  const { nombre, descripcion, precio_costo, precio_venta, stock_minimo } = req.body || {};

  try {
    await asegurarColumnaStockMinimoProductos();

    const prodActual = await pool.query('SELECT * FROM productos WHERE id_producto = $1', [idProd]);
    if (prodActual.rows.length === 0) {
      return res.status(404).json({ exito: false, mensaje: 'Producto no encontrado.' });
    }

    const p = prodActual.rows[0];
    const nuevoNombre = nombre !== undefined ? String(nombre).trim() : p.nombre;
    const nuevaDesc = descripcion !== undefined ? (descripcion ? String(descripcion).trim() : null) : p.descripcion;
    const nuevoCosto = precio_costo !== undefined ? parseFloat(precio_costo) : parseFloat(p.precio_costo || 0);
    const nuevaVenta = precio_venta !== undefined ? parseFloat(precio_venta) : parseFloat(p.precio_venta || 0);
    const nuevoStockMin = stock_minimo !== undefined ? parseInt(stock_minimo, 10) : parseInt(p.stock_minimo ?? 10, 10);

    if (!nuevoNombre) {
      return res.status(400).json({
        exito: false,
        success: false,
        mensaje: 'El nombre del producto no puede estar vacío.',
      });
    }

    if (isNaN(nuevoCosto) || nuevoCosto < 0 || isNaN(nuevaVenta) || nuevaVenta < 0 || isNaN(nuevoStockMin) || nuevoStockMin < 0) {
      return res.status(400).json({
        exito: false,
        success: false,
        mensaje: 'Los precios y el stock mínimo deben ser números válidos mayores o iguales a 0.',
      });
    }

    const resultado = await pool.query(
      `UPDATE productos
       SET nombre = $1, descripcion = $2, precio_costo = $3, precio_venta = $4, stock_minimo = $5
       WHERE id_producto = $6
       RETURNING id_producto, codigo_barras, nombre, descripcion, precio_costo, precio_venta, stock_minimo;`,
      [nuevoNombre, nuevaDesc, nuevoCosto, nuevaVenta, nuevoStockMin, idProd]
    );

    const prodActualizado = resultado.rows[0];
    const cambioPrecio = Number(p.precio_costo) !== nuevoCosto || Number(p.precio_venta) !== nuevaVenta;

    await registrarAuditoria(
      req.user?.id_usuario || req.user?.id,
      cambioPrecio ? 'MODIFICAR_PRECIO' : 'MODIFICAR_PRODUCTO',
      `Producto ID #${idProd} ("${prodActualizado.nombre}") actualizado: Costo $${p.precio_costo} -> $${prodActualizado.precio_costo}, Venta $${p.precio_venta} -> $${prodActualizado.precio_venta}, Stock Mín: ${prodActualizado.stock_minimo}`,
      req
    );

    return res.status(200).json({
      exito: true,
      success: true,
      mensaje: 'Producto actualizado correctamente.',
      producto: prodActualizado,
      data: prodActualizado,
    });
  } catch (error) {
    console.error('Error al actualizar producto:', error);
    return res.status(500).json({
      exito: false,
      success: false,
      mensaje: 'Error de Servidor: ' + error.message,
    });
  }
});

module.exports = router;
