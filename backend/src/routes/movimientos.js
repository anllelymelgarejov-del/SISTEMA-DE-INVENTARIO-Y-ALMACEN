const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const pool = require('../config/db');

/**
 * ============================================================================
 * RUTA DE MOVIMIENTOS Y AUDITORÍA (KARDEX / ENTRADAS, SALIDAS Y PROVEEDORES)
 * ============================================================================
 * Tabla: movimientos (id_movimiento, id_almacen, id_producto, id_lote, id_usuario, tipo, cantidad, fecha, observacion)
 */

// Helper para extraer el usuario autenticado desde el header Authorization (si está presente)
function obtenerUsuarioDesdeRequest(req) {
  if (req.user && (req.user.id || req.user.id_usuario)) {
    return {
      id_usuario: parseInt(req.user.id || req.user.id_usuario, 10),
      nombre: req.user.nombre || null,
      rol: req.user.rol || null,
    };
  }

  const authHeader = req.headers['authorization'] || req.headers['Authorization'];
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.split(' ')[1];
    const secret = process.env.JWT_SECRET || 'wms_secret_fallback_key';
    try {
      const decoded = jwt.verify(token, secret);
      return {
        id_usuario: parseInt(decoded.id || decoded.id_usuario || 1, 10),
        nombre: decoded.nombre || null,
        rol: decoded.rol || null,
      };
    } catch (err) {
      // Si el token no pudo verificarse con la clave primaria, intentar decodificar payload
      try {
        const decodedFallback = jwt.decode(token);
        if (decodedFallback && (decodedFallback.id || decodedFallback.id_usuario)) {
          return {
            id_usuario: parseInt(decodedFallback.id || decodedFallback.id_usuario, 10),
            nombre: decodedFallback.nombre || null,
            rol: decodedFallback.rol || null,
          };
        }
      } catch (_) {}
    }
  }

  const idBody = parseInt(req.body?.id_usuario, 10);
  return {
    id_usuario: !isNaN(idBody) && idBody > 0 ? idBody : 1,
    nombre: null,
    rol: null,
  };
}

// Asegurar de forma transparente que la columna 'observacion' exista en la tabla movimientos
let esquemaVerificado = false;
async function asegurarColumnaObservacion() {
  if (esquemaVerificado) return;
  try {
    await pool.query('ALTER TABLE movimientos ADD COLUMN IF NOT EXISTS observacion TEXT;');
    esquemaVerificado = true;
  } catch (_) {
    esquemaVerificado = true;
  }
}

// Consulta reutilizable de Historial de Movimientos con Auditoría de Usuario y Rol
const consultarHistorialMovimientos = async (req, res) => {
  try {
    await asegurarColumnaObservacion();

    const query = `
      SELECT 
        m.id_movimiento, 
        m.id_usuario,
        m.tipo, 
        m.cantidad, 
        m.fecha, 
        COALESCE(m.observacion, '') AS observacion,
        a.nombre AS almacen, 
        p.nombre AS producto, 
        p.codigo_barras,
        l.numero_lote, 
        TO_CHAR(l.fecha_vencimiento, 'YYYY-MM-DD') AS fecha_vencimiento,
        COALESCE(u.nombre, 'Sistema') AS usuario,
        CASE 
          WHEN u.id_rol = 1 THEN 'Administrador'
          WHEN u.id_rol = 2 THEN 'Operario'
          ELSE COALESCE(r.nombre, 'Administrador')
        END AS rol_usuario
      FROM movimientos m 
      LEFT JOIN almacenes a ON m.id_almacen = a.id_almacen 
      LEFT JOIN productos p ON m.id_producto = p.id_producto 
      LEFT JOIN lotes l ON m.id_lote = l.id_lote 
      LEFT JOIN usuarios u ON m.id_usuario = u.id_usuario 
      LEFT JOIN roles r ON u.id_rol = r.id_rol
      ORDER BY m.fecha DESC, m.id_movimiento DESC 
      LIMIT 200;
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
};

// GET /api/movimientos y GET /api/movimientos/historial
router.get('/', consultarHistorialMovimientos);
router.get('/historial', consultarHistorialMovimientos);

// POST /api/movimientos y /api/movimientos/registrar - Registro de Entradas y Salidas con Auditoría y Proveedor
const registrarMovimiento = async (req, res) => {
  await asegurarColumnaObservacion();

  const {
    tipo_movimiento = 'ENTRADA',
    tipo,
    id_almacen,
    id_producto,
    numero_lote,
    fecha_vencimiento,
    cantidad,
    proveedor,
    origen,
    observacion,
  } = req.body || {};

  const operacion = String(tipo || tipo_movimiento).toUpperCase().trim();
  const almId = parseInt(id_almacen, 10);
  const prodId = parseInt(id_producto, 10);
  const cantNum = parseInt(cantidad, 10);
  const loteLimpio = String(numero_lote || '').trim().toUpperCase();

  // Extraer usuario autenticado para el log de auditoría
  const infoUsuario = obtenerUsuarioDesdeRequest(req);
  const idUsuarioAuditoria = infoUsuario.id_usuario || 1;

  // Construir observación de trazabilidad (Proveedor / Origen + Nota de auditoría)
  const proveedorLimpio = String(proveedor || origen || '').trim();
  const notaLimpia = String(observacion || '').trim();
  let observacionFinal = '';

  if (operacion === 'ENTRADA') {
    if (proveedorLimpio && notaLimpia) {
      observacionFinal = `Proveedor: ${proveedorLimpio} | ${notaLimpia}`;
    } else if (proveedorLimpio) {
      observacionFinal = `Proveedor: ${proveedorLimpio}`;
    } else if (notaLimpia) {
      observacionFinal = notaLimpia;
    } else {
      observacionFinal = 'Recepción estándar de mercancía en almacén';
    }
  } else {
    if (proveedorLimpio && notaLimpia) {
      observacionFinal = `Destino/Ref: ${proveedorLimpio} | ${notaLimpia}`;
    } else if (proveedorLimpio) {
      observacionFinal = `Destino/Ref: ${proveedorLimpio}`;
    } else if (notaLimpia) {
      observacionFinal = notaLimpia;
    } else {
      observacionFinal = 'Despacho / salida operativa de lote';
    }
  }

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

      // Registrar movimiento con id_usuario y observacion (proveedor/origen)
      await client.query(
        `INSERT INTO movimientos (tipo, id_almacen, id_producto, id_lote, cantidad, id_usuario, observacion, fecha)
         VALUES ('ENTRADA', $1, $2, $3, $4, $5, $6, CURRENT_TIMESTAMP);`,
        [almId, prodId, loteId, cantNum, idUsuarioAuditoria, observacionFinal]
      );

      await client.query('COMMIT');

      return res.status(201).json({
        exito: true,
        mensaje: `Entrada registrada: +${cantNum} uds de "${nombreProducto}" en ${nombreAlmacen}.`,
        nuevo_stock: invRes.rows[0].cantidad,
        id_usuario: idUsuarioAuditoria,
        observacion: observacionFinal,
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

      // Registrar movimiento con id_usuario y observacion
      await client.query(
        `INSERT INTO movimientos (tipo, id_almacen, id_producto, id_lote, cantidad, id_usuario, observacion, fecha)
         VALUES ('SALIDA', $1, $2, $3, $4, $5, $6, CURRENT_TIMESTAMP);`,
        [almId, prodId, loteId, cantNum, idUsuarioAuditoria, observacionFinal]
      );

      await client.query('COMMIT');

      return res.status(200).json({
        exito: true,
        mensaje: `Salida registrada: -${cantNum} uds de "${nombreProducto}" en ${nombreAlmacen}.`,
        nuevo_stock: updateInv.rows[0].cantidad,
        id_usuario: idUsuarioAuditoria,
        observacion: observacionFinal,
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
