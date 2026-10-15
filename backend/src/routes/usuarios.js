const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const pool = require('../config/db');
const { verificarToken, verificarRol } = require('../middlewares/auth');

/**
 * ============================================================================
 * MÓDULO EXCLUSIVO DE ADMINISTRACIÓN DE USUARIOS (ROL: ADMIN)
 * ============================================================================
 * Tabla: usuarios (id_usuario, nombre, email, password_hash, id_rol)
 * Tabla: roles    (id_rol, nombre)
 */

// 1. GET /api/usuarios - Listar todos los usuarios con su nombre de rol
router.get('/', verificarToken, verificarRol('ADMIN'), async (req, res) => {
  try {
    const query = `
      SELECT 
        u.id_usuario, 
        u.nombre, 
        u.email, 
        u.id_rol, 
        CASE 
          WHEN u.id_rol = 1 THEN 'ADMIN' 
          WHEN u.id_rol = 2 THEN 'OPERARIO' 
          ELSE 'OPERARIO' 
        END AS rol 
      FROM usuarios u 
      LEFT JOIN roles r ON u.id_rol = r.id_rol 
      WHERE u.id_rol IN (1, 2)
      ORDER BY u.id_usuario ASC;
    `;

    const resultado = await pool.query(query);

    return res.status(200).json({
      exito: true,
      success: true,
      total: resultado.rowCount,
      data: resultado.rows,
      usuarios: resultado.rows,
    });
  } catch (error) {
    console.error('Error al listar usuarios:', error);
    return res.status(500).json({
      exito: false,
      success: false,
      mensaje: 'Error de Servidor: ' + error.message,
      error: error.message,
    });
  }
});

// 2. POST /api/usuarios - Registrar nuevo usuario (Exclusivo ADMIN)
router.post('/', verificarToken, verificarRol('ADMIN'), async (req, res) => {
  try {
    const { nombre, email, password, id_rol } = req.body || {};

    // Validar campos obligatorios
    if (!nombre || !email || !password) {
      return res.status(400).json({
        exito: false,
        success: false,
        mensaje: 'Los campos nombre, email y password son obligatorios.',
      });
    }

    const emailLimpio = String(email).trim().toLowerCase();
    const nombreLimpio = String(nombre).trim();
    const passLimpia = String(password).trim();
    const rolIdNum = parseInt(id_rol, 10);
    if (![1, 2].includes(rolIdNum)) {
      return res.status(400).json({
        exito: false,
        success: false,
        mensaje: 'Rol inválido. Los únicos roles permitidos en el sistema son Administrador (1) y Operario (2).',
      });
    }

    if (passLimpia.length < 4) {
      return res.status(400).json({
        exito: false,
        success: false,
        mensaje: 'La contraseña debe contener al menos 4 caracteres.',
      });
    }

    // Verificar si el correo ya existe
    const usuarioExistente = await pool.query(
      'SELECT id_usuario FROM usuarios WHERE LOWER(email) = $1',
      [emailLimpio]
    );

    if (usuarioExistente.rows.length > 0) {
      return res.status(400).json({
        exito: false,
        success: false,
        mensaje: `El correo '${emailLimpio}' ya se encuentra registrado en el sistema.`,
      });
    }

    // Encriptar la contraseña con bcrypt (10 rounds de salt)
    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(passLimpia, salt);

    // Insertar en la tabla usuarios
    const queryInsert = `
      INSERT INTO usuarios (nombre, email, password_hash, id_rol) 
      VALUES ($1, $2, $3, $4) 
      RETURNING id_usuario, nombre, email, id_rol;
    `;

    const resultado = await pool.query(queryInsert, [
      nombreLimpio,
      emailLimpio,
      passwordHash,
      rolIdNum,
    ]);

    const nuevoUsuario = resultado.rows[0];
    const nombreRol = rolIdNum === 1 ? 'ADMIN' : 'OPERARIO';
    nuevoUsuario.rol = nombreRol;

    return res.status(201).json({
      exito: true,
      success: true,
      mensaje: 'Usuario registrado correctamente',
      usuario: nuevoUsuario,
      data: nuevoUsuario,
    });

  } catch (error) {
    console.error('Error al registrar usuario:', error);
    return res.status(500).json({
      exito: false,
      success: false,
      mensaje: 'Error de Servidor: ' + error.message,
      error: error.message,
    });
  }
});

// 3. DELETE /api/usuarios/:id - Eliminar usuario del sistema (Exclusivo ADMIN)
router.delete('/:id', verificarToken, verificarRol('ADMIN'), async (req, res) => {
  const client = await pool.connect();
  try {
    const idUsuario = parseInt(req.params.id, 10);

    if (isNaN(idUsuario) || idUsuario <= 0) {
      return res.status(400).json({
        exito: false,
        success: false,
        mensaje: 'ID de usuario inválido.',
      });
    }

    // RESTRICCIÓN DE SEGURIDAD: Prohibido eliminar al administrador principal (ID 1)
    if (idUsuario === 1) {
      return res.status(400).json({
        exito: false,
        success: false,
        mensaje: 'Acción no permitida: El usuario Administrador principal (ID 1) no puede ser eliminado del sistema.',
      });
    }

    // Verificar existencia del usuario y validar por correo institucional
    const resBusqueda = await client.query(
      'SELECT id_usuario, nombre, email, id_rol FROM usuarios WHERE id_usuario = $1',
      [idUsuario]
    );

    if (resBusqueda.rows.length === 0) {
      return res.status(404).json({
        exito: false,
        success: false,
        mensaje: `El usuario con ID ${idUsuario} no existe en el sistema.`,
      });
    }

    const usuarioAEliminar = resBusqueda.rows[0];

    // Doble verificación: El correo del administrador principal no puede ser eliminado
    if (usuarioAEliminar.email && usuarioAEliminar.email.toLowerCase() === 'admin@almacen.com') {
      return res.status(400).json({
        exito: false,
        success: false,
        mensaje: 'Acción no permitida: La cuenta principal del Administrador (admin@almacen.com) no puede ser eliminada.',
      });
    }

    await client.query('BEGIN');

    // Preservar trazabilidad del Kardex reasignando movimientos históricos al administrador principal
    await client.query('UPDATE movimientos SET id_usuario = 1 WHERE id_usuario = $1', [idUsuario]);

    // Ejecutar eliminación directa del usuario
    await client.query('DELETE FROM usuarios WHERE id_usuario = $1', [idUsuario]);

    await client.query('COMMIT');

    return res.status(200).json({
      exito: true,
      success: true,
      mensaje: `Usuario '${usuarioAEliminar.nombre}' eliminado correctamente.`,
      id_usuario: idUsuario,
    });

  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('Error al eliminar usuario:', error);
    return res.status(500).json({
      exito: false,
      success: false,
      mensaje: 'Error de Servidor al eliminar usuario: ' + error.message,
      error: error.message,
    });
  } finally {
    client.release();
  }
});

module.exports = router;
