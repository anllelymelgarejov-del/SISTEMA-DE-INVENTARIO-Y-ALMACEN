const express = require('express');
const router = express.Router();
const pool = require('../config/db');

/**
 * ============================================================================
 * RUTA SIMPLIFICADA DE ALMACENES
 * ============================================================================
 * Tabla: almacenes (id_almacen, nombre, direccion)
 */

// GET /api/almacenes - Listar todos los almacenes
router.get('/', async (req, res) => {
  try {
    const query = `
      SELECT 
        id_almacen, 
        nombre, 
        direccion 
      FROM almacenes 
      ORDER BY id_almacen ASC;
    `;

    const resultado = await pool.query(query);

    // Mapear filas agregando código amigable como fallback visual para el frontend
    const almacenes = resultado.rows.map(alm => ({
      ...alm,
      codigo: `ALM-${String(alm.id_almacen).padStart(2, '0')}`,
    }));

    return res.status(200).json({
      exito: true,
      success: true,
      total: resultado.rowCount,
      data: almacenes,
      almacenes: almacenes,
    });
  } catch (error) {
    console.error('Error al consultar almacenes:', error);
    return res.status(500).json({
      exito: false,
      success: false,
      mensaje: 'Error de Servidor: ' + error.message,
      error: error.message,
    });
  }
});

// GET /api/almacenes/:id - Obtener un almacén por su ID
router.get('/:id', async (req, res) => {
  const { id } = req.params;
  try {
    const query = `
      SELECT 
        id_almacen, 
        nombre, 
        direccion 
      FROM almacenes 
      WHERE id_almacen = $1;
    `;
    const resultado = await pool.query(query, [id]);

    if (resultado.rows.length === 0) {
      return res.status(404).json({
        exito: false,
        mensaje: 'Almacén no encontrado.',
      });
    }

    const alm = resultado.rows[0];
    alm.codigo = `ALM-${String(alm.id_almacen).padStart(2, '0')}`;

    return res.status(200).json({
      exito: true,
      data: alm,
    });
  } catch (error) {
    console.error('Error al consultar almacén por ID:', error);
    return res.status(500).json({
      exito: false,
      mensaje: 'Error de Servidor: ' + error.message,
    });
  }
});

module.exports = router;
