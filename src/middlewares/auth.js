const jwt = require('jsonwebtoken');

/**
 * Middleware para autenticar peticiones mediante JSON Web Token (JWT).
 * Extrae y valida el token del encabezado 'Authorization: Bearer <token>'.
 * Si es válido, inyecta la información del usuario en 'req.user'.
 */
const verificarToken = (req, res, next) => {
  const authHeader = req.headers['authorization'] || req.headers['Authorization'];

  if (!authHeader) {
    return res.status(401).json({
      success: false,
      mensaje: 'Acceso no autorizado: No se proporcionó el token de autenticación.',
    });
  }

  const parts = authHeader.split(' ');
  if (parts.length !== 2 || parts[0] !== 'Bearer') {
    return res.status(401).json({
      success: false,
      mensaje: 'Formato de token no válido. Debe ser: Bearer <token>',
    });
  }

  const token = parts[1];
  const secret = process.env.JWT_SECRET || 'wms_secret_fallback_key';

  jwt.verify(token, secret, (err, decoded) => {
    if (err) {
      if (err.name === 'TokenExpiredError') {
        return res.status(401).json({
          success: false,
          mensaje: 'El token de sesión ha expirado. Por favor, inicia sesión nuevamente.',
        });
      }
      return res.status(403).json({
        success: false,
        mensaje: 'Token de autenticación inválido o alterado.',
      });
    }

    // Inyectar usuario autenticado: { id, email, rol, rol_id, nombre }
    req.user = decoded;
    next();
  });
};

/**
 * Middleware para verificar permisos por rol (Control de Acceso Basado en Roles - RBAC).
 * Permite pasar un array de roles o argumentos separados:
 * Ejemplo: verificarRol(['ADMIN', 'JEFE_ALMACEN']) o verificarRol('ADMIN', 'JEFE_ALMACEN')
 */
const verificarRol = (...rolesPermitidos) => {
  // Aplanar argumentos en caso de que se pase un arreglo o strings individuales
  const rolesAplanados = rolesPermitidos
    .flat()
    .map((r) => String(r).toUpperCase().replace(/[\s-]+/g, '_'));

  return (req, res, next) => {
    if (!req.user || !req.user.rol) {
      return res.status(403).json({
        success: false,
        mensaje: 'Permisos insuficientes: No se pudo verificar el rol del usuario autenticado.',
      });
    }

    const rolUsuario = String(req.user.rol).toUpperCase().replace(/[\s-]+/g, '_');

    if (!rolesAplanados.includes(rolUsuario)) {
      return res.status(403).json({
        success: false,
        mensaje: `Acceso restringido: El rol actual '${req.user.rol}' no tiene permisos para esta acción. Roles autorizados: [${rolesAplanados.join(', ')}].`,
      });
    }

    next();
  };
};

module.exports = {
  verificarToken,
  verificarRol,
  // Alias de compatibilidad
  authenticateToken: verificarToken,
  authorizeRoles: verificarRol,
};
