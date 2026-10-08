const express = require('express');
const router = express.Router();
const pool = require('../config/db');

/**
 * ============================================================================
 * RUTA SIMPLIFICADA DE MOVIMIENTOS (KARDEX / ENTRADAS Y SALIDAS)
 * ============================================================================
 * Tabla: movimientos (id_movimiento, tipo, id_almacen, id_producto, id_lote, cantidad, id_usuario, fecha)
 */

// GET /api/movimientos - Consulta de historial con LEFT JOIN
router.get('/', async (req, res) => {
  try {
    const query = `
      SELECT 
        m.id_movimiento, 
        m.tipo, 
        m.cantidad, 
        m.fecha, 
        a.nombre AS almacen, 
        p.nombre AS producto, 
        l.numero_lote, 
        COALESCE(u.nombre, 'Sistema') AS usuario 
      FROM movimientos m 
      LEFT JOIN almacenes a ON m.id_almacen = a.id_almacen 
      LEFT JOIN productos p ON m.id_producto = p.id_producto 
      LEFT JOIN lotes l ON m.id_lote = l.id_lote 
      LEFT JOIN usuarios u ON m.id_usuario = u.id_usuario 
      ORDER BY m.fecha DESC 
      LIMIT 100;
    `;
    const resultado = await pool.query(query);
    return res.status(200).json(resultado.rows);
  } catch (error) {
    console.error('Error al consultar historial de movimientos:', error);
    return res.status(500).json({
      exito: false,
      mensaje: 'Error de Servidor: ' + error.message,
    });
  }
});

// Alias GET /api/movimientos/historial
router.get('/historial', async (req, res) => {
  try {
    const query = `
      SELECT 
        m.id_movimiento, 
        m.tipo, 
        m.cantidad, 
        m.fecha, 
        a.nombre AS almacen, 
        p.nombre AS producto, 
        l.numero_lote, 
        COALESCE(u.nombre, 'Sistema') AS usuario 
      FROM movimientos m 
      LEFT JOIN almacenes a ON m.id_almacen = a.id_almacen 
      LEFT JOIN productos p ON m.id_producto = p.id_producto 
      LEFT JOIN lotes l ON m.id_lote = l.id_lote 
      LEFT JOIN usuarios u ON m.id_usuario = u.id_usuario 
      ORDER BY m.fecha DESC 
      LIMIT 100;
    `;
    const resultado = await pool.query(query);
    return res.status(200).json(resultado.rows);
  } catch (error) {
    console.error('Error al consultar historial de movimientos:', error);
    return res.status(500).json({
      exito: false,
      mensaje: 'Error de Servidor: ' + error.message,
    });
  }
});

// POST /api/movimientos y /api/movimientos/registrar - Registro de Entradas y Salidas
const registrarMovimiento = async (req, res) => {
  const {
    tipo_movimiento = 'ENTRADA',
    tipo,
    id_almacen,
    id_producto,
    numero_lote,
    fecha_vencimiento,
    cantidad,
  } = req.body || {};

  const operacion = String(tipo || tipo_movimiento).toUpperCase().trim();
  const almId = parseInt(id_almacen, 10);
  const prodId = parseInt(id_producto, 10);
  const cantNum = parseInt(cantidad, 10);
  const loteLimpio = String(numero_lote || '').trim().toUpperCase();

  // Validaciones
  if (!almId || !prodId || !loteLimpio || isNaN(cantNum) || cantNum <= 0) {
    return res.status(400).json({
      exito: false,
      mensaje: 'Campos obligatorios: id_almacen, id_producto, numero_lote y cantidad mayor a 0.',
    });
  }

  if (operacion !== 'ENTRADA' && operacion !== 'SALIDA') {
    return res.status(400).json({
      exito: false,
      mensaje: "El tipo de operación debe ser 'ENTRADA' o 'SALIDA'.",
    });
  }

  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // 1. Validar almacén
    const almRes = await client.query('SELECT id_almacen, nombre FROM almacenes WHERE id_almacen = $1', [almId]);
    if (almRes.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ exito: false, mensaje: 'Almacén no encontrado.' });
    }
    const nombreAlmacen = almRes.rows[0].nombre;

    // 2. Validar producto
    const prodRes = await client.query('SELECT id_producto, nombre FROM productos WHERE id_producto = $1', [prodId]);
    if (prodRes.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ exito: false, mensaje: 'Producto no encontrado.' });
    }
    const nombreProducto = prodRes.rows[0].nombre;

    // 3. Buscar o registrar lote
    let loteId;
    const loteExistente = await client.query(
      'SELECT id_lote, fecha_vencimiento FROM lotes WHERE id_producto = $1 AND numero_lote = $2',
      [prodId, loteLimpio]
    );

    if (operacion === 'ENTRADA') {
      if (loteExistente.rows.length > 0) {
        loteId = loteExistente.rows[0].id_lote;
      } else {
        if (!fecha_vencimiento) {
          await client.query('ROLLBACK');
          return res.status(400).json({
            exito: false,
            mensaje: 'Para registrar un lote nuevo, la fecha de vencimiento es obligatoria (YYYY-MM-DD).',
          });
        }
        const nuevoLote = await client.query(
          'INSERT INTO lotes (id_producto, numero_lote, fecha_vencimiento) VALUES ($1, $2, $3) RETURNING id_lote',
          [prodId, loteLimpio, fecha_vencimiento]
        );
        loteId = nuevoLote.rows[0].id_lote;
      }

      // Sumar stock
      const invRes = await client.query(
        `INSERT INTO inventario (id_almacen, id_producto, id_lote, cantidad)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (id_almacen, id_producto, id_lote)
         DO UPDATE SET cantidad = inventario.cantidad + EXCLUDED.cantidad
         RETURNING cantidad;`,
        [almId, prodId, loteId, cantNum]
      );

      // Registrar movimiento
      await client.query(
        `INSERT INTO movimientos (tipo, id_almacen, id_producto, id_lote, cantidad, id_usuario, fecha)
         VALUES ('ENTRADA', $1, $2, $3, $4, $5, CURRENT_TIMESTAMP);`,
        [almId, prodId, loteId, cantNum, req.user?.id || 1]
      );

      await client.query('COMMIT');

      return res.status(201).json({
        exito: true,
        mensaje: `Entrada registrada: +${cantNum} uds de "${nombreProducto}" en ${nombreAlmacen}.`,
        nuevo_stock: invRes.rows[0].cantidad,
      });

    } else {
      // SALIDA
      if (loteExistente.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(404).json({
          exito: false,
          mensaje: `No existe el lote ${loteLimpio} para el producto ${nombreProducto}.`,
        });
      }
      loteId = loteExistente.rows[0].id_lote;

      // Validar stock disponible
      const invRes = await client.query(
        'SELECT cantidad FROM inventario WHERE id_almacen = $1 AND id_producto = $2 AND id_lote = $3 FOR UPDATE',
        [almId, prodId, loteId]
      );

      const stockDisponible = invRes.rows.length > 0 ? invRes.rows[0].cantidad : 0;
      if (stockDisponible < cantNum) {
        await client.query('ROLLBACK');
        return res.status(400).json({
          exito: false,
          mensaje: `Stock insuficiente en ${nombreAlmacen}. Disponible: ${stockDisponible} uds, Solicitado: ${cantNum} uds.`,
        });
      }

      // Descontar inventario
      const updateInv = await client.query(
        `UPDATE inventario 
         SET cantidad = cantidad - $1 
         WHERE id_almacen = $2 AND id_producto = $3 AND id_lote = $4
         RETURNING cantidad;`,
        [cantNum, almId, prodId, loteId]
      );

      // Registrar movimiento
      await client.query(
        `INSERT INTO movimientos (tipo, id_almacen, id_producto, id_lote, cantidad, id_usuario, fecha)
         VALUES ('SALIDA', $1, $2, $3, $4, $5, CURRENT_TIMESTAMP);`,
        [almId, prodId, loteId, cantNum, req.user?.id || 1]
      );

      await client.query('COMMIT');

      return res.status(200).json({
        exito: true,
        mensaje: `Salida registrada: -${cantNum} uds de "${nombreProducto}" en ${nombreAlmacen}.`,
        nuevo_stock: updateInv.rows[0].cantidad,
      });
    }

  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error al registrar movimiento:', error);
    return res.status(500).json({
      exito: false,
      mensaje: 'Error de Servidor: ' + error.message,
    });
  } finally {
    client.release();
  }
};

router.post('/', registrarMovimiento);
router.post('/registrar', registrarMovimiento);

module.exports = router;