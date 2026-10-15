const { Pool } = require('pg');
require('dotenv').config();

/**
 * ============================================================================
 * CONFIGURACIÓN DEL POOL DE CONEXIONES POSTGRESQL (LOCAL Y NUBE)
 * ============================================================================
 * Soporta dos modalidades de conexión:
 * 1. Nube / Producción (Supabase / Render / Heroku):
 *    Utiliza la variable de entorno DATABASE_URL (Connection URI) y habilita
 *    el cifrado SSL requerido por proveedores cloud (rejectUnauthorized: false).
 * 2. Desarrollo Local:
 *    Utiliza variables desglosadas (DB_USER, DB_HOST, DB_NAME, DB_PASSWORD, DB_PORT).
 */
const poolConfig = process.env.DATABASE_URL
  ? {
      connectionString: process.env.DATABASE_URL,
      ssl: {
        rejectUnauthorized: false, // Imprescindible para certificados SSL autofirmados de Supabase
      },
      max: Number(process.env.DB_MAX_CONNECTIONS) || 20,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 10000,
    }
  : {
      user: process.env.DB_USER,
      host: process.env.DB_HOST,
      database: process.env.DB_NAME,
      password: process.env.DB_PASSWORD,
      port: Number(process.env.DB_PORT) || 5432,
      ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false,
      max: 20,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 5000,
    };

const pool = new Pool(poolConfig);

// Evento de conexión exitosa
pool.on('connect', () => {
  const modo = process.env.DATABASE_URL ? 'Cloud (SSL activado)' : 'Local (PostgreSQL)';
  console.log(`✓ Conexión establecida con la base de datos PostgreSQL [${modo}].`);
});

// Manejo de errores en clientes inactivos del pool
pool.on('error', (err) => {
  console.error('✗ Error inesperado en el cliente del Pool de PostgreSQL:', err);
  process.exit(-1);
});

module.exports = pool;