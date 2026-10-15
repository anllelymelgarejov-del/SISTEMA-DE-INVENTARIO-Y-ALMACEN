const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const pool = require('../config/db');

/**
 * ============================================================================
 * CONTROLADOR DE AUTENTICACIÓN SIMPLIFICADO Y ROBUSTO
 * ============================================================================
 * @route   POST /api/auth/login
 * @desc    Valida credenciales, genera token JWT y mapea el rol del usuario
 * @access  Público
 */
router.post('/login', async (req, res) => {
  try {
    // 1. Extraer credenciales con fallback seguro ante bodies indefinidos
    const { email, password } = req.body || {};

    if (!email || !password) {
      return res.status(400).json({
        exito: false,
        success: false,
        mensaje: 'Por favor, proporciona el correo electrónico y la contraseña.',
      });
    }

    // 2. Consulta a la estructura simplificada de la tabla usuarios
    const query = `
      SELECT 
        id_usuario, 
        nombre, 
        email, 
        password_hash, 
        id_rol 
      FROM usuarios 
      WHERE LOWER(email) = LOWER($1);
    `;

    const resultado = await pool.query(query, [email.trim()]);

    // 3. Validar existencia del usuario
    if (resultado.rows.length === 0) {
      return res.status(401).json({
        exito: false,
        success: false,
        mensaje: 'Credenciales inválidas.',
      });
    }

    const usuario = resultado.rows[0];

    // 4. Validación de contraseña (soporta tanto bcrypt hash como texto plano)
    const passAlmacenada = String(usuario.password_hash || '');
    let passwordValida = false;

    if (passAlmacenada.startsWith('$2a$') || passAlmacenada.startsWith('$2b$')) {
      passwordValida = await bcrypt.compare(password, passAlmacenada);
    } else {
      passwordValida = (password === passAlmacenada);
    }

    if (!passwordValida) {
      return res.status(401).json({
        exito: false,
        success: false,
        mensaje: 'Credenciales inválidas.',
      });
    }

    // 5. Mapeo de Rol (id_rol 1 = ADMIN, otros = OPERARIO)
    const rol = (usuario.id_rol === 1) ? 'ADMIN' : 'OPERARIO';

    // 6. Generación de Token JWT
    const secret = process.env.JWT_SECRET || 'wms_secret_fallback_key';
    const payload = {
      id: usuario.id_usuario,
      id_usuario: usuario.id_usuario,
      nombre: usuario.nombre,
      email: usuario.email,
      rol: rol,
      id_rol: usuario.id_rol,
      rol_id: usuario.id_rol,
    };

    const token = jwt.sign(payload, secret, { expiresIn: '24h' });

    // Objeto estandarizado de usuario
    const usuarioRespuesta = {
      id: usuario.id_usuario,
      id_usuario: usuario.id_usuario,
      nombre: usuario.nombre,
      email: usuario.email,
      rol: rol,
      id_rol: usuario.id_rol,
    };

    // 7. Respuesta JSON 200 con formato unificado y compatible
    return res.status(200).json({
      exito: true,
      success: true,
      mensaje: `Inicio de sesión exitoso. Bienvenido, ${usuario.nombre}.`,
      token,
      usuario: usuarioRespuesta,
      data: {
        token,
        usuario: usuarioRespuesta,
      },
    });

  } catch (error) {
    // Registro detallado en la consola del servidor para depuración
    console.error('CRITICAL ERROR EN POST /api/auth/login:', error);

    // Respuesta 500 con detalle del mensaje de error
    return res.status(500).json({
      exito: false,
      success: false,
      mensaje: 'Error de Servidor: ' + error.message,
      error: error.message,
    });
  }
});

/**
 * @route   POST /api/auth/recuperar-password
 * @desc    Registra solicitud informativa de recuperación de contraseña
 */
router.post('/recuperar-password', async (req, res) => {
  try {
    const { email } = req.body || {};
    return res.status(200).json({
      exito: true,
      success: true,
      mensaje: `Solicitud recibida para '${email || ''}'. Comunícate con el Administrador para el reseteo de tus credenciales.`,
    });
  } catch (error) {
    console.error('Error en recuperar-password:', error);
    return res.status(500).json({
      exito: false,
      success: false,
      mensaje: error.message,
    });
  }
});

/**
 * @route   GET /api/auth/perfil
 * @desc    Obtiene información del usuario autenticado
 */
router.get('/perfil', async (req, res) => {
  const authHeader = req.headers['authorization'];
  if (!authHeader) {
    return res.status(401).json({ exito: false, mensaje: 'Token no proporcionado' });
  }

  const token = authHeader.split(' ')[1];
  const secret = process.env.JWT_SECRET || 'wms_secret_fallback_key';

  jwt.verify(token, secret, (err, decoded) => {
    if (err) return res.status(403).json({ exito: false, mensaje: 'Token inválido' });
    return res.json({ exito: true, usuario: decoded });
  });
});

module.exports = router;