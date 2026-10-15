const express = require('express');
const router = express.Router();
const pool = require('../config/db');

/**
 * ============================================================================
 * RUTA SIMPLIFICADA DE PRODUCTOS
 * ============================================================================
 * Tabla: productos (id_producto, codigo_barras, nombre, descripcion, precio_costo, precio_venta)
 */

// GET /api/productos - Obtener catálogo completo de productos
router.get('/', async (req, res) => {
  try {
    const query = `
      SELECT 
        id_producto, 
        codigo_barras, 
        nombre, 
        descripcion, 
        precio_costo, 
        precio_venta 
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
router.get('/:id', async (req, res) => {
  const { id } = req.params;
  try {
    const query = `
      SELECT 
        id_producto, 
        codigo_barras, 
        nombre, 
        descripcion, 
        precio_costo, 
        precio_venta 
      FROM productos 
      WHERE id_producto = $1;
    `;
    const resultado = await pool.query(query, [id]);

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

// POST /api/productos - Crear nuevo producto en el catálogo
router.post('/', async (req, res) => {
  const {
    codigo_barras,
    nombre,
    descripcion = null,
    precio_costo = 0,
    precio_venta = 0,
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

  if (isNaN(costoNum) || costoNum < 0 || isNaN(ventaNum) || ventaNum < 0) {
    return res.status(400).json({
      exito: false,
      success: false,
      mensaje: 'Los precios deben ser números válidos mayores o iguales a 0.',
    });
  }

  try {
    const query = `
      INSERT INTO productos (
        codigo_barras, 
        nombre, 
        descripcion, 
        precio_costo, 
        precio_venta
      ) VALUES ($1, $2, $3, $4, $5)
      RETURNING id_producto, codigo_barras, nombre, descripcion, precio_costo, precio_venta;
    `;

    const valores = [
      String(codigo_barras).trim(),
      String(nombre).trim(),
      descripcion ? String(descripcion).trim() : null,
      costoNum,
      ventaNum,
    ];

    const resultado = await pool.query(query, valores);
    const nuevoProducto = resultado.rows[0];

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

module.exports = router;
