const express = require('express');
const pool = require('../config/db');
const { verificarToken } = require('../middlewares/auth');

const router = express.Router();
router.use(verificarToken);

// El esquema oficial no tiene una columna de estado en productos; se consideran activos todos los productos catalogados.
router.get('/reposicion', async (_req, res) => {
  try {
    const result = await pool.query(`
      WITH stock AS (
        SELECT id_producto, SUM(cantidad)::numeric AS stock_actual
        FROM inventario GROUP BY id_producto
      ), consumo AS (
        SELECT id_producto, SUM(cantidad)::numeric AS consumo_30_dias
        FROM movimientos
        WHERE tipo = 'SALIDA' AND fecha >= CURRENT_TIMESTAMP - INTERVAL '30 days'
        GROUP BY id_producto
      )
      SELECT p.id_producto, p.codigo_barras, p.nombre AS producto,
             COALESCE(s.stock_actual, 0) AS stock_actual,
             COALESCE(c.consumo_30_dias, 0) AS consumo_30_dias,
             COALESCE(c.consumo_30_dias, 0) / 30.0 AS consumo_diario,
             CASE WHEN COALESCE(c.consumo_30_dias, 0) > 0
                  THEN COALESCE(s.stock_actual, 0) / (c.consumo_30_dias / 30.0)
                  ELSE NULL END AS dias_cobertura,
             GREATEST(0, CEIL(COALESCE(c.consumo_30_dias, 0) - COALESCE(s.stock_actual, 0))) AS cantidad_sugerida
      FROM productos p
      LEFT JOIN stock s ON s.id_producto = p.id_producto
      LEFT JOIN consumo c ON c.id_producto = p.id_producto
      ORDER BY cantidad_sugerida DESC, p.nombre ASC`);
    return res.json({ exito: true, success: true, total: result.rowCount, data: result.rows });
  } catch (error) {
    console.error('Error al calcular reposición:', error);
    return res.status(500).json({ exito: false, mensaje: 'No se pudo calcular la reposición.' });
  }
});

module.exports = router;
