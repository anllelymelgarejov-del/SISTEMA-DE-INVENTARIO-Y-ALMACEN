-- ==============================================================================
-- ESQUEMA OFICIAL DE LA BASE DE DATOS - SISTEMA WMS (ESQUEMA SIMPLIFICADO)
-- Archivo: db/schema.sql
-- ==============================================================================
-- Crea TODAS las tablas que consume el backend (src/routes/*) y carga los datos
-- semilla necesarios para iniciar sesión y probar el sistema.
--
-- El script es IDEMPOTENTE: puede ejecutarse varias veces sin generar errores.
--
-- Uso:
--   1) Crea la base de datos (si aún no existe):
--        psql -U postgres -c "CREATE DATABASE sis_inv_almacen;"
--   2) Ejecuta este esquema:
--        psql -U postgres -d sis_inv_almacen -f db/schema.sql
--
-- En pgAdmin 4: clic derecho sobre la base > Query Tool > abrir este archivo > F5.
--
-- Credenciales semilla:
--   admin@almacen.com     -> admin123        (rol ADMIN)
--   operario@almacen.com  -> Operario1234!   (rol OPERARIO)
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1. TABLAS
-- ------------------------------------------------------------------------------

-- 1.1 Roles (RBAC)
CREATE TABLE IF NOT EXISTS roles (
    id_rol SERIAL PRIMARY KEY,
    nombre VARCHAR(50) NOT NULL UNIQUE
);

-- 1.2 Usuarios del sistema
CREATE TABLE IF NOT EXISTS usuarios (
    id_usuario SERIAL PRIMARY KEY,
    nombre VARCHAR(100) NOT NULL,
    email VARCHAR(100) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    id_rol INT REFERENCES roles(id_rol) ON DELETE RESTRICT
);

-- 1.3 Almacenes (sedes / depósitos)
CREATE TABLE IF NOT EXISTS almacenes (
    id_almacen SERIAL PRIMARY KEY,
    nombre VARCHAR(100) NOT NULL,
    direccion VARCHAR(255)
);

-- 1.4 Catálogo maestro de productos
CREATE TABLE IF NOT EXISTS productos (
    id_producto SERIAL PRIMARY KEY,
    codigo_barras VARCHAR(100) UNIQUE NOT NULL,
    nombre VARCHAR(150) NOT NULL,
    descripcion TEXT,
    precio_costo NUMERIC(10,2) DEFAULT 0.00 CHECK (precio_costo >= 0),
    precio_venta NUMERIC(10,2) DEFAULT 0.00 CHECK (precio_venta >= 0)
);

-- 1.5 Lotes (trazabilidad / control FEFO de vencimientos)
CREATE TABLE IF NOT EXISTS lotes (
    id_lote SERIAL PRIMARY KEY,
    id_producto INT NOT NULL REFERENCES productos(id_producto) ON DELETE CASCADE,
    numero_lote VARCHAR(100) NOT NULL,
    fecha_vencimiento DATE NOT NULL,
    CONSTRAINT uq_producto_lote UNIQUE (id_producto, numero_lote)
);

-- 1.6 Inventario: stock por almacén + producto + lote
--     La restricción única (id_almacen, id_producto, id_lote) es OBLIGATORIA:
--     la utiliza POST /api/movimientos  ->  ON CONFLICT (...) DO UPDATE.
CREATE TABLE IF NOT EXISTS inventario (
    id_inventario SERIAL PRIMARY KEY,
    id_almacen INT NOT NULL REFERENCES almacenes(id_almacen) ON DELETE CASCADE,
    id_producto INT NOT NULL REFERENCES productos(id_producto) ON DELETE CASCADE,
    id_lote INT NOT NULL REFERENCES lotes(id_lote) ON DELETE CASCADE,
    cantidad INT NOT NULL DEFAULT 0 CHECK (cantidad >= 0),
    CONSTRAINT uq_inventario_almacen_lote UNIQUE (id_almacen, id_producto, id_lote)
);

-- 1.7 Kardex / historial de movimientos (entradas y salidas)
CREATE TABLE IF NOT EXISTS movimientos (
    id_movimiento SERIAL PRIMARY KEY,
    tipo VARCHAR(10) CHECK (tipo IN ('ENTRADA','SALIDA')),
    id_almacen INT REFERENCES almacenes(id_almacen),
    id_producto INT REFERENCES productos(id_producto),
    id_lote INT REFERENCES lotes(id_lote),
    cantidad INT NOT NULL CHECK (cantidad > 0),
    id_usuario INT REFERENCES usuarios(id_usuario),
    fecha TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 1.8 Índices de rendimiento
CREATE INDEX IF NOT EXISTS idx_inventario_almacen   ON inventario(id_almacen);
CREATE INDEX IF NOT EXISTS idx_inventario_producto  ON inventario(id_producto);
CREATE INDEX IF NOT EXISTS idx_lotes_vencimiento    ON lotes(fecha_vencimiento);
CREATE INDEX IF NOT EXISTS idx_movimientos_fecha    ON movimientos(fecha DESC);

-- ------------------------------------------------------------------------------
-- 2. BLINDAJE DE RESTRICCIONES ÚNICAS
--    (por si la base ya existía creada con un esquema anterior incompleto)
-- ------------------------------------------------------------------------------
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'uq_inventario_almacen_lote') THEN
        ALTER TABLE inventario
            ADD CONSTRAINT uq_inventario_almacen_lote UNIQUE (id_almacen, id_producto, id_lote);
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'uq_producto_lote') THEN
        ALTER TABLE lotes
            ADD CONSTRAINT uq_producto_lote UNIQUE (id_producto, numero_lote);
    END IF;
END $$;

-- ------------------------------------------------------------------------------
-- 3. DATOS SEMILLA
-- ------------------------------------------------------------------------------

-- 3.1 Roles
INSERT INTO roles (id_rol, nombre) VALUES
    (1, 'ADMIN'),
    (2, 'OPERARIO')
ON CONFLICT (id_rol) DO UPDATE SET nombre = EXCLUDED.nombre;

-- 3.2 Usuarios (contraseñas cifradas con bcrypt)
INSERT INTO usuarios (id_usuario, nombre, email, password_hash, id_rol) VALUES
    (1, 'Administrador General', 'admin@almacen.com',
        '$2b$10$oNzitFm2ig.LFLEBX1/YQu54jjPhBW.MRK/mz9yjmsn27atMfEebW', 1),
    (2, 'Luis Ramírez (Operario)', 'operario@almacen.com',
        '$2b$10$pam/o2y8xyzuPPXwv3jyouRH2m7vGVtMe1zzw8wKBgvzJw/3RYSMq', 2)
ON CONFLICT (email) DO UPDATE SET
    nombre        = EXCLUDED.nombre,
    password_hash = EXCLUDED.password_hash,
    id_rol        = EXCLUDED.id_rol;

-- 3.3 Almacenes
INSERT INTO almacenes (id_almacen, nombre, direccion) VALUES
    (1, 'Almacén Central Principal', 'Av. Industrial 500, Sede Central'),
    (2, 'Depósito Auxiliar Norte',   'Calle Comercio 120, Norte')
ON CONFLICT (id_almacen) DO UPDATE SET
    nombre    = EXCLUDED.nombre,
    direccion = EXCLUDED.direccion;

-- 3.4 Productos
INSERT INTO productos (id_producto, codigo_barras, nombre, descripcion, precio_costo, precio_venta) VALUES
    (1, '75010001001', 'Amoxicilina 500mg (Caja 30 cápsulas)',  'Antibiótico de amplio espectro', 5.50, 12.00),
    (2, '75010001002', 'Paracetamol 500mg (Caja 100 tabletas)', 'Analgésico y antipirético oral', 3.20,  8.50),
    (3, '75010001003', 'Ibuprofeno 400mg (Caja 50 cápsulas)',   'Antiinflamatorio no esteroideo', 4.10,  9.80)
ON CONFLICT (codigo_barras) DO UPDATE SET
    nombre       = EXCLUDED.nombre,
    descripcion  = EXCLUDED.descripcion,
    precio_costo = EXCLUDED.precio_costo,
    precio_venta = EXCLUDED.precio_venta;

-- 3.5 Lotes de prueba (con fechas de vencimiento para FEFO)
INSERT INTO lotes (id_lote, id_producto, numero_lote, fecha_vencimiento) VALUES
    (1, 1, 'AMX-2026-A', '2026-11-15'),
    (2, 1, 'AMX-2027-B', '2027-05-20'),
    (3, 2, 'PAR-2026-X', '2026-12-31')
ON CONFLICT (id_producto, numero_lote) DO UPDATE SET
    fecha_vencimiento = EXCLUDED.fecha_vencimiento;

-- 3.6 Stock inicial por almacén, producto y lote
INSERT INTO inventario (id_almacen, id_producto, id_lote, cantidad) VALUES
    (1, 1, 1, 30),
    (1, 1, 2, 50),
    (1, 2, 3, 150),
    (2, 1, 1, 20)
ON CONFLICT (id_almacen, id_producto, id_lote) DO UPDATE SET
    cantidad = EXCLUDED.cantidad;

-- ------------------------------------------------------------------------------
-- 4. AJUSTE DE SECUENCIAS (los nuevos IDs continúan sin colisión)
-- ------------------------------------------------------------------------------
SELECT setval('roles_id_rol_seq',             (SELECT MAX(id_rol)         FROM roles));
SELECT setval('usuarios_id_usuario_seq',      (SELECT MAX(id_usuario)     FROM usuarios));
SELECT setval('almacenes_id_almacen_seq',     (SELECT MAX(id_almacen)     FROM almacenes));
SELECT setval('productos_id_producto_seq',    (SELECT MAX(id_producto)    FROM productos));
SELECT setval('lotes_id_lote_seq',            (SELECT MAX(id_lote)        FROM lotes));
SELECT setval('inventario_id_inventario_seq', (SELECT MAX(id_inventario)  FROM inventario));

-- ==============================================================================
-- FIN DEL ESQUEMA
-- ==============================================================================
