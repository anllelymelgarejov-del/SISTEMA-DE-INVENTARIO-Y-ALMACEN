const express = require('express');
const router = express.Router();
const pool = require('../config/db');
const { verificarToken, verificarRol } = require('../middlewares/auth');

/**
 * ============================================================================
 * MÓDULO DE REGISTRO DE AUDITORÍA DE ACTIVIDAD (ACTIVITY LOGS)
 * ============================================================================
 * Tabla: logs_auditoria (id_log, id_usuario, accion, detalles, ip_origen, fecha_hora)
 */

let tablaAuditoriaVerificada = false;
async function asegurarTablaAuditoria() {
  if (tablaAuditoriaVerificada) return;
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS logs_auditoria (
        id_log SERIAL PRIMARY KEY,
        id_usuario INT REFERENCES usuarios(id_usuario) ON DELETE SET NULL,
        accion VARCHAR(100) NOT NULL,
        detalles TEXT,
        ip_origen VARCHAR(60),
        fecha_hora TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
    tablaAuditoriaVerificada = true;
  } catch (error) {
    console.error('Error al verificar tabla logs_auditoria:', error);
    tablaAuditoriaVerificada = true;
  }
}

/**
 * Extrae la IP de origen de la petición HTTP
 */
function obtenerIpOrigen(req) {
  if (!req) return '127.0.0.1';
  const forwarded = req.headers?.['x-forwarded-for'];
  if (forwarded) {
    return String(forwarded).split(',')[0].trim();
  }
  return req.ip || req.socket?.remoteAddress || '127.0.0.1';
}

/**
 * Función utilitaria reutilizable para registrar de forma inmutable acciones
 * administrativas críticas (CREAR_PRODUCTO, MODIFICAR_PRECIO, CREAR_USUARIO, ELIMINAR_USUARIO, etc.)
 *
 * @param {number|null} id_usuario - ID del usuario que ejecuta la acción
 * @param {string} accion - Código estandarizado de la acción (ej. 'CREAR_PRODUCTO')
 * @param {string|object} detalles - Descripción o payload JSON de los cambios
 * @param {object} [req] - Objeto Request de Express para extraer IP y fallback de usuario
 */
async function registrarAuditoria(id_usuario, accion, detalles, req = null) {
  try {
    await asegurarTablaAuditoria();

    const idUsr = parseInt(id_usuario || req?.user?.id_usuario || req?.user?.id, 10);
    const idUsuarioFinal = !isNaN(idUsr) && idUsr > 0 ? idUsr : null;
    const accionLimpia = String(accion || 'ACCION_SISTEMA').trim().toUpperCase();
    const detallesTexto = typeof detalles === 'object' && detalles !== null
      ? JSON.stringify(detalles)
      : String(detalles || '');
    const ipOrigen = obtenerIpOrigen(req);

    await pool.query(
      `INSERT INTO logs_auditoria (id_usuario, accion, detalles, ip_origen, fecha_hora)
       VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP);`,
      [idUsuarioFinal, accionLimpia, detallesTexto, ipOrigen]
    );
  } catch (error) {
    console.error('Error al registrar log de auditoría:', error);
  }
}

/**
 * @route   GET /api/auditoria
 * @desc    Consulta el historial completo de logs de actividad administrativa
 *          con filtros opcionales por fecha, usuario y acción (Exclusivo ADMIN)
 */
router.get('/', verificarToken, verificarRol('ADMIN'), async (req, res) => {
  try {
    await asegurarTablaAuditoria();

    const { id_usuario, usuario, accion, fecha, fecha_desde, fecha_hasta } = req.query;
    const condiciones = [];
    const valores = [];

    if (id_usuario && !isNaN(parseInt(id_usuario, 10))) {
      valores.push(parseInt(id_usuario, 10));
      condiciones.push(`l.id_usuario = $${valores.length}`);
    }

    if (usuario && String(usuario).trim()) {
      valores.push(`%${String(usuario).trim().toLowerCase()}%`);
      condiciones.push(`(LOWER(COALESCE(u.nombre, '')) LIKE $${valores.length} OR LOWER(COALESCE(u.email, '')) LIKE $${valores.length} OR LOWER(COALESCE(l.detalles, '')) LIKE $${valores.length})`);
    }

    if (accion && String(accion).trim()) {
      valores.push(String(accion).trim().toUpperCase());
      condiciones.push(`UPPER(l.accion) = $${valores.length}`);
    }

    if (fecha && String(fecha).trim()) {
      valores.push(String(fecha).trim());
      condiciones.push(`DATE(l.fecha_hora) = $${valores.length}::date`);
    } else {
      if (fecha_desde && String(fecha_desde).trim()) {
        valores.push(String(fecha_desde).trim());
        condiciones.push(`DATE(l.fecha_hora) >= $${valores.length}::date`);
      }
      if (fecha_hasta && String(fecha_hasta).trim()) {
        valores.push(String(fecha_hasta).trim());
        condiciones.push(`DATE(l.fecha_hora) <= $${valores.length}::date`);
      }
    }

    const whereClause = condiciones.length > 0 ? `WHERE ${condiciones.join(' AND ')}` : '';

    const query = `
      SELECT 
        l.id_log,
        l.id_usuario,
        COALESCE(u.nombre, 'Administrador / Sistema') AS usuario,
        COALESCE(u.nombre, 'Administrador / Sistema') AS usuario_nombre,
        COALESCE(u.email, 'admin@almacen.com') AS email_usuario,
        COALESCE(u.email, 'admin@almacen.com') AS usuario_email,
        CASE 
          WHEN u.id_rol = 1 THEN 'ADMIN'
          WHEN u.id_rol = 2 THEN 'OPERARIO'
          ELSE 'ADMIN'
        END AS rol_usuario,
        l.accion,
        COALESCE(l.detalles, '') AS detalles,
        COALESCE(l.ip_origen, '127.0.0.1') AS ip_origen,
        l.fecha_hora
      FROM logs_auditoria l
      LEFT JOIN usuarios u ON l.id_usuario = u.id_usuario
      ${whereClause}
      ORDER BY l.fecha_hora DESC, l.id_log DESC
      LIMIT 300;
    `;

    const resultado = await pool.query(query, valores);

    return res.status(200).json({
      exito: true,
      success: true,
      total: resultado.rowCount,
      logs: resultado.rows,
      data: resultado.rows,
    });
  } catch (error) {
    console.error('Error al consultar logs de auditoría:', error);
    return res.status(500).json({
      exito: false,
      success: false,
      mensaje: 'Error de Servidor: ' + error.message,
      error: error.message,
    });
  }
});

router.registrarAuditoria = registrarAuditoria;
router.asegurarTablaAuditoria = asegurarTablaAuditoria;

module.exports = router;
