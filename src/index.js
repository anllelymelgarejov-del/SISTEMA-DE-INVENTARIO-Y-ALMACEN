require('dotenv').config();
const path = require('path');
const express = require('express');
const cors = require('cors');

// Importación de rutas modulares simplificadas
const authRoutes = require('./routes/auth');
const usuariosRoutes = require('./routes/usuarios');
const almacenesRoutes = require('./routes/almacenes');
const productosRoutes = require('./routes/productos');
const inventarioRoutes = require('./routes/inventario');
const movimientosRoutes = require('./routes/movimientos');
const reportesRoutes = require('./routes/reportes');

const app = express();
const PORT = process.env.PORT || 3000;

// ==============================================================================
// 1. MIDDLEWARES GLOBALES (Estrictamente ANTES de las rutas)
// ==============================================================================
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Servir archivos estáticos del frontend desde la carpeta 'public'
app.use(express.static(path.join(__dirname, '../public')));

// ==============================================================================
// 2. REGISTRO DE RUTAS DE LA API
// ==============================================================================

// Autenticación y Gestión de Usuarios
app.use('/api/auth', authRoutes);
app.use('/api/usuarios', usuariosRoutes);

// Almacenes
app.use('/api/almacenes', almacenesRoutes);

// Catálogo de Productos
app.use('/api/productos', productosRoutes);

// Inventario por Lotes y Almacén
app.use('/api/inventario', inventarioRoutes);
app.use('/api/lotes', inventarioRoutes);
app.use('/api/wms', inventarioRoutes);

// Movimientos y Kardex
app.use('/api/movimientos', require('./routes/movimientos'));

// Reportes
app.use('/api/reportes', reportesRoutes);

// Endpoint informativo y de salud de la API
app.get('/api', (req, res) => {
  res.json({
    exito: true,
    nombre: 'API REST - Sistema de Gestión de Inventarios y Almacenes (WMS)',
    version: '2.0.0',
    estado: 'Servicio en línea',
  });
});

// ==============================================================================
// 3. MANEJO DE RUTAS NO ENCONTRADAS (404) Y ERRORES GENERALES (500)
// ==============================================================================
app.use((req, res) => {
  res.status(404).json({
    exito: false,
    mensaje: `La ruta solicitada '${req.originalUrl}' no existe en este servidor.`,
  });
});

app.use((err, req, res, next) => {
  if (err instanceof SyntaxError && err.status === 400 && 'body' in err) {
    return res.status(400).json({
      exito: false,
      mensaje: 'Formato JSON inválido en el cuerpo de la petición.',
    });
  }
  console.error('Error no controlado en el servidor:', err.stack);
  res.status(500).json({
    exito: false,
    mensaje: 'Ocurrió un error inesperado en el servidor.',
    error: process.env.NODE_ENV === 'development' ? err.message : undefined,
  });
});

// ==============================================================================
// 4. INICIO DEL SERVIDOR HTTP
// ==============================================================================
const server = app.listen(PORT, () => {
  console.log(`====================================================`);
  console.log(` Servidor de Inventario escuchando en puerto: ${PORT}`);
  console.log(` URL Local: http://localhost:${PORT}`);
  console.log(`====================================================`);
});

module.exports = { app, server };