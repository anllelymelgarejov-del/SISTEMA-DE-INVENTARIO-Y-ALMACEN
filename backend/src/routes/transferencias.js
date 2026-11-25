const express = require('express');
const pool = require('../config/db');
const { verificarToken } = require('../middlewares/auth');

const router = express.Router();

// Todas las operaciones de este módulo requieren una sesión JWT.
router.use(verificarToken);

const consultaTransferencias = `
  SELECT
    t.id_transferencia,
    t.fecha,
    t.estado,
    t.id_almacen_origen,
    ao.nombre AS almacen_origen,
    t.id_almacen_destino,
    ad.nombre AS almacen_destino,
    t.id_usuario,
    COALESCE(u.nombre, 'Sistema') AS usuario,
    COALESCE(
      json_agg(
        json_build_object(
          'id_detalle', dt.id_detalle,
          'producto_id', p.id_producto,
          'producto', p.nombre,
          'codigo_barras', p.codigo_barras,
          'lote_id', l.id_lote,
          'numero_lote', l.numero_lote,
          'cantidad', dt.cantidad
        ) ORDER BY dt.id_detalle
      ) FILTER (WHERE dt.id_detalle IS NOT NULL),
      '[]'::json
    ) AS items
  FROM transferencias t
  INNER JOIN almacenes ao ON ao.id_almacen = t.id_almacen_origen
  INNER JOIN almacenes ad ON ad.id_almacen = t.id_almacen_destino
  LEFT JOIN usuarios u ON u.id_usuario = t.id_usuario
  LEFT JOIN detalle_transferencias dt ON dt.id_transferencia = t.id_transferencia
  LEFT JOIN productos p ON p.id_producto = dt.id_producto
  LEFT JOIN lotes l ON l.id_lote = dt.id_lote
`;

router.get('/', async (req, res) => {
  try {
    const result = await pool.query(
      `${consultaTransferencias}
       GROUP BY t.id_transferencia, ao.nombre, ad.nombre, u.nombre
       ORDER BY t.fecha DESC, t.id_transferencia DESC;`
    );
    return res.status(200).json({ exito: true, success: true, total: result.rowCount, data: result.rows });
  } catch (error) {
    console.error('Error al consultar transferencias:', error);
    return res.status(500).json({ exito: false, success: false, mensaje: 'Error al consultar el historial de transferencias.' });
  }
});

router.get('/:id', async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isSafeInteger(id) || id <= 0) {
    return res.status(400).json({ exito: false, success: false, mensaje: 'ID de transferencia inválido.' });
  }

  try {
    const result = await pool.query(
      `${consultaTransferencias}
       WHERE t.id_transferencia = $1
       GROUP BY t.id_transferencia, ao.nombre, ad.nombre, u.nombre;`,
      [id]
    );
    if (!result.rowCount) {
      return res.status(404).json({ exito: false, success: false, mensaje: 'Transferencia no encontrada.' });
    }
    return res.status(200).json({ exito: true, success: true, data: result.rows[0] });
  } catch (error) {
    console.error('Error al consultar detalle de transferencia:', error);
    return res.status(500).json({ exito: false, success: false, mensaje: 'Error al consultar la transferencia.' });
  }
});

router.post('/', async (req, res) => {
  const {
    id_almacen_origen: origenRaw,
    id_almacen_destino: destinoRaw,
    observaciones,
    notas,
    items,
  } = req.body || {};
  const origen = Number(origenRaw);
  const destino = Number(destinoRaw);
  const usuarioId = Number(req.user?.id_usuario || req.user?.id);

  if (!Number.isSafeInteger(origen) || origen <= 0 || !Number.isSafeInteger(destino) || destino <= 0) {
    return res.status(400).json({ exito: false, success: false, mensaje: 'Selecciona almacenes de origen y destino válidos.' });
  }
  if (origen === destino) {
    return res.status(400).json({ exito: false, success: false, mensaje: 'El almacén de origen debe ser distinto al almacén de destino.' });
  }
  if (!Number.isSafeInteger(usuarioId) || usuarioId <= 0) {
    return res.status(401).json({ exito: false, success: false, mensaje: 'El token no contiene un usuario válido.' });
  }
  if (!Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ exito: false, success: false, mensaje: 'Agrega al menos un producto a la transferencia.' });
  }

  // Consolidar líneas repetidas evita validar dos veces el mismo stock disponible.
  const itemsPorClave = new Map();
  for (const item of items) {
    const productoId = Number(item?.producto_id);
    const loteId = Number(item?.lote_id);
    const cantidad = Number(item?.cantidad);
    if (![productoId, loteId, cantidad].every(Number.isSafeInteger) || productoId <= 0 || loteId <= 0 || cantidad <= 0) {
      return res.status(400).json({ exito: false, success: false, mensaje: 'Cada ítem debe tener producto, lote y cantidad entera mayor a cero.' });
    }
    const key = `${productoId}:${loteId}`;
    const existente = itemsPorClave.get(key);
    itemsPorClave.set(key, { productoId, loteId, cantidad: cantidad + (existente?.cantidad || 0) });
  }
  const lineas = [...itemsPorClave.values()].sort((a, b) => a.productoId - b.productoId || a.loteId - b.loteId);

  const client = await pool.connect();
  let transaccionAbierta = false;
  try {
    await client.query('BEGIN');
    transaccionAbierta = true;

    const almacenes = await client.query(
      'SELECT id_almacen FROM almacenes WHERE id_almacen = ANY($1::int[]) FOR SHARE',
      [[origen, destino]]
    );
    if (almacenes.rowCount !== 2) {
      await client.query('ROLLBACK');
      transaccionAbierta = false;
      return res.status(400).json({ exito: false, success: false, mensaje: 'El almacén de origen o destino no existe.' });
    }

    const productosLotes = new Map();
    for (const item of lineas) {
      const stockResult = await client.query(
        `SELECT i.cantidad, p.nombre AS producto, l.numero_lote, (l.fecha_vencimiento < CURRENT_DATE) AS vencido
         FROM inventario i
         INNER JOIN productos p ON p.id_producto = i.id_producto
         INNER JOIN lotes l ON l.id_lote = i.id_lote AND l.id_producto = i.id_producto
         WHERE i.id_almacen = $1 AND i.id_producto = $2 AND i.id_lote = $3
         FOR UPDATE OF i`,
        [origen, item.productoId, item.loteId]
      );
      const stock = stockResult.rows[0];
      const etiqueta = stock ? `${stock.producto} (lote ${stock.numero_lote})` : `producto #${item.productoId}, lote #${item.loteId}`;
      if (stock?.vencido) {
        await client.query('ROLLBACK');
        transaccionAbierta = false;
        return res.status(400).json({ exito: false, success: false, mensaje: `No se puede despachar ${etiqueta}: el lote está vencido.` });
      }
      if (!stock || Number(stock.cantidad) < item.cantidad) {
        const disponible = stock ? Number(stock.cantidad) : 0;
        await client.query('ROLLBACK');
        transaccionAbierta = false;
        return res.status(400).json({
          exito: false,
          success: false,
          mensaje: `Stock insuficiente para ${etiqueta}. Disponible: ${disponible}; solicitado: ${item.cantidad}.`,
        });
      }
      productosLotes.set(`${item.productoId}:${item.loteId}`, stock);
    }

    const encabezado = await client.query(
      `INSERT INTO transferencias (id_almacen_origen, id_almacen_destino, id_usuario)
       VALUES ($1, $2, $3) RETURNING id_transferencia, fecha, estado`,
      [origen, destino, usuarioId]
    );
    const transferencia = encabezado.rows[0];
    const nota = String(observaciones || notas || '').trim();

    for (const item of lineas) {
      const meta = productosLotes.get(`${item.productoId}:${item.loteId}`);
      await client.query(
        `INSERT INTO detalle_transferencias (id_transferencia, id_producto, id_lote, cantidad)
         VALUES ($1, $2, $3, $4)`,
        [transferencia.id_transferencia, item.productoId, item.loteId, item.cantidad]
      );

      await client.query(
        `UPDATE inventario SET cantidad = cantidad - $1
         WHERE id_almacen = $2 AND id_producto = $3 AND id_lote = $4`,
        [item.cantidad, origen, item.productoId, item.loteId]
      );
      await client.query(
        `INSERT INTO inventario (id_almacen, id_producto, id_lote, cantidad)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (id_almacen, id_producto, id_lote)
         DO UPDATE SET cantidad = inventario.cantidad + EXCLUDED.cantidad`,
        [destino, item.productoId, item.loteId, item.cantidad]
      );

      const notaBase = `Transferencia #${transferencia.id_transferencia}: ${meta.producto} / lote ${meta.numero_lote}`;
      const observacion = nota ? `${notaBase}. ${nota}` : notaBase;
      await client.query(
        `INSERT INTO movimientos (id_almacen, id_producto, id_lote, id_usuario, tipo, cantidad, observacion)
         VALUES ($1, $2, $3, $4, 'SALIDA', $5, $6),
                ($7, $2, $3, $4, 'ENTRADA', $5, $6)`,
        [origen, item.productoId, item.loteId, usuarioId, item.cantidad, observacion, destino]
      );
    }

    await client.query('COMMIT');
    transaccionAbierta = false;
    return res.status(201).json({
      exito: true,
      success: true,
      mensaje: `Transferencia #${transferencia.id_transferencia} registrada correctamente.`,
      data: { ...transferencia, id_almacen_origen: origen, id_almacen_destino: destino, total_items: lineas.length },
    });
  } catch (error) {
    if (transaccionAbierta) await client.query('ROLLBACK').catch(() => {});
    console.error('Error al registrar transferencia:', error);
    return res.status(500).json({ exito: false, success: false, mensaje: 'Error al registrar la transferencia.' });
  } finally {
    client.release();
  }
});

module.exports = router;
