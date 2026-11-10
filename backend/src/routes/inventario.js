const express = require('express');
const router = express.Router();
const pool = require('../config/db');
const { verificarToken, verificarRol } = require('../middlewares/auth');

/**
 * ============================================================================
 * RUTA SIMPLIFICADA DE INVENTARIO
 * ============================================================================
 * Tablas vinculadas:
 * - inventario (id_inventario, id_almacen, id_producto, id_lote, cantidad)
 * - almacenes  (id_almacen, nombre, direccion)
 * - productos  (id_producto, codigo_barras, nombre, descripcion, precio_costo, precio_venta)
 * - lotes      (id_lote, id_producto, numero_lote, fecha_vencimiento)
 */

// Asegurar de forma transparente que las columnas 'stock_minimo' existan en productos e inventario
let esquemaStockMinimoVerificado = false;
async function asegurarColumnaStockMinimo() {
  if (esquemaStockMinimoVerificado) return;
  try {
    await pool.query('ALTER TABLE productos ADD COLUMN IF NOT EXISTS stock_minimo INT NOT NULL DEFAULT 10;');
    await pool.query('ALTER TABLE inventario ADD COLUMN IF NOT EXISTS stock_minimo INT NOT NULL DEFAULT 10;');
    esquemaStockMinimoVerificado = true;
  } catch (_) {
    esquemaStockMinimoVerificado = true;
  }
}

const obtenerInventario = async (req, res) => {
  const { id_almacen } = req.query;

  try {
    await asegurarColumnaStockMinimo();

    let query = `
      SELECT 
        i.id_inventario, 
        a.id_almacen, 
        a.nombre AS nombre_almacen, 
        a.nombre AS almacen,
        p.id_producto, 
        p.codigo_barras, 
        p.codigo_barras AS codigo,
        p.nombre AS nombre_producto, 
        p.nombre AS producto_nombre, 
        p.nombre AS producto,
        p.descripcion,
        l.id_lote, 
        l.numero_lote, 
        l.numero_lote AS lote,
        TO_CHAR(l.fecha_vencimiento, 'YYYY-MM-DD') AS fecha_vencimiento, 
        (l.fecha_vencimiento - CURRENT_DATE) AS dias_para_vencer,
        i.cantidad,
        COALESCE(p.stock_minimo, i.stock_minimo, 10) AS stock_minimo,
        (i.cantidad <= COALESCE(p.stock_minimo, i.stock_minimo, 10)) AS alerta_stock,
        CASE 
          WHEN i.cantidad <= COALESCE(p.stock_minimo, i.stock_minimo, 10) THEN 'Crítico por Stock'
          ELSE 'Stock Normal'
        END AS estado_stock
      FROM inventario i 
      INNER JOIN almacenes a ON i.id_almacen = a.id_almacen 
      INNER JOIN productos p ON i.id_producto = p.id_producto 
      INNER JOIN lotes l ON i.id_lote = l.id_lote 
      WHERE i.cantidad > 0
    `;

    const params = [];
    if (id_almacen) {
      query += ` AND i.id_almacen = $1 `;
      params.push(parseInt(id_almacen, 10));
    }

    query += ` ORDER BY a.id_almacen ASC, p.nombre ASC;`;

    const resultado = await pool.query(query, params);

    return res.status(200).json({
      exito: true,
      success: true,
      total: resultado.rowCount,
      data: resultado.rows,
      inventario: resultado.rows,
    });
  } catch (error) {
    console.error('Error al consultar inventario:', error);
    return res.status(500).json({
      exito: false,
      success: false,
      mensaje: 'Error de Servidor: ' + error.message,
      error: error.message,
    });
  }
};

// Endpoints principales y alias
router.get('/', verificarToken, obtenerInventario);
router.get('/ubicaciones-lotes', verificarToken, obtenerInventario);
router.get('/inventario-detallado', verificarToken, obtenerInventario);

// GET /api/inventario/alertas-stock - Listar productos cuyo stock actual <= stock_minimo
router.get('/alertas-stock', verificarToken, async (req, res) => {
  try {
    await asegurarColumnaStockMinimo();

    const query = `
      SELECT 
        i.id_inventario,
        a.id_almacen,
        a.nombre AS nombre_almacen,
        p.id_producto,
        p.codigo_barras,
        p.nombre AS nombre_producto,
        l.id_lote,
        l.numero_lote,
        TO_CHAR(l.fecha_vencimiento, 'YYYY-MM-DD') AS fecha_vencimiento,
        i.cantidad,
        COALESCE(p.stock_minimo, i.stock_minimo, 10) AS stock_minimo,
        TRUE AS alerta_stock,
        'Crítico por Stock' AS estado_stock
      FROM inventario i
      INNER JOIN almacenes a ON i.id_almacen = a.id_almacen
      INNER JOIN productos p ON i.id_producto = p.id_producto
      INNER JOIN lotes l ON i.id_lote = l.id_lote
      WHERE i.cantidad > 0
        AND i.cantidad <= COALESCE(p.stock_minimo, i.stock_minimo, 10)
      ORDER BY i.cantidad ASC, p.nombre ASC;
    `;

    const resultado = await pool.query(query);
    return res.status(200).json({
      exito: true,
      success: true,
      total: resultado.rowCount,
      data: resultado.rows,
      alertas: resultado.rows,
    });
  } catch (error) {
    console.error('Error al consultar alertas de stock mínimo:', error);
    return res.status(500).json({
      exito: false,
      success: false,
      mensaje: 'Error de Servidor: ' + error.message,
    });
  }
});

// GET /api/inventario/lotes - Listar lotes de productos
router.get('/lotes', verificarToken, async (req, res) => {
  const { id_producto } = req.query;
  try {
    let query = `
      SELECT 
        l.id_lote, 
        l.id_producto, 
        l.numero_lote, 
        TO_CHAR(l.fecha_vencimiento, 'YYYY-MM-DD') AS fecha_vencimiento,
        (l.fecha_vencimiento - CURRENT_DATE) AS dias_para_vencer
      FROM lotes l
    `;
    const params = [];
    if (id_producto) {
      query += ` WHERE l.id_producto = $1 `;
      params.push(parseInt(id_producto, 10));
    }
    query += ` ORDER BY l.fecha_vencimiento ASC;`;

    const resultado = await pool.query(query, params);
    return res.status(200).json({
      exito: true,
      success: true,
      total: resultado.rowCount,
      data: resultado.rows,
    });
  } catch (error) {
    console.error('Error al consultar lotes:', error);
    return res.status(500).json({
      exito: false,
      mensaje: 'Error de Servidor: ' + error.message,
    });
  }
});

module.exports = router;
