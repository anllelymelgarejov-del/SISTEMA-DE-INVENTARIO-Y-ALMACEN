-- ==============================================================================
-- SISTEMA DE GESTIÓN DE ALMACENES (WMS - Warehouse Management System)
-- Script DDL y DML para PostgreSQL / pgAdmin 4
-- ==============================================================================

-- 1. TABLA DE ROLES DE USUARIO (RBAC)
CREATE TABLE IF NOT EXISTS roles (
    id_rol SERIAL PRIMARY KEY,
    nombre VARCHAR(50) UNIQUE NOT NULL, -- 'ADMIN', 'JEFE_ALMACEN', 'OPERARIO'
    descripcion TEXT
);

-- 2. TABLA DE USUARIOS
CREATE TABLE IF NOT EXISTS usuarios (
    id_usuario SERIAL PRIMARY KEY,
    id_rol INT NOT NULL REFERENCES roles(id_rol) ON DELETE RESTRICT,
    nombre VARCHAR(100) NOT NULL,
    email VARCHAR(150) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    activo BOOLEAN NOT NULL DEFAULT TRUE,
    creado_en TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 3. TABLA DE ALMACENES (Sedes / Depósitos)
CREATE TABLE IF NOT EXISTS almacenes (
    id_almacen SERIAL PRIMARY KEY,
    codigo VARCHAR(50) UNIQUE NOT NULL,
    nombre VARCHAR(120) NOT NULL,
    direccion TEXT NOT NULL,
    activo BOOLEAN NOT NULL DEFAULT TRUE
);

-- 4. TABLA DE UBICACIONES FÍSICAS DENTRO DEL ALMACÉN (Rack, Pasillo, Casillero)
CREATE TABLE IF NOT EXISTS ubicaciones (
    id_ubicacion SERIAL PRIMARY KEY,
    id_almacen INT NOT NULL REFERENCES almacenes(id_almacen) ON DELETE CASCADE,
    pasillo VARCHAR(20) NOT NULL,
    estanteria VARCHAR(20) NOT NULL,
    nivel VARCHAR(20) NOT NULL,
    casillero VARCHAR(20) DEFAULT 'C01',
    codigo_ubicacion VARCHAR(50) UNIQUE NOT NULL, -- Ej: 'ALM-CENTRAL-P01-E01-N01-C01'
    capacidad_maxima NUMERIC(10, 2) DEFAULT 1000.00,
    activo BOOLEAN NOT NULL DEFAULT TRUE,
    CONSTRAINT uq_almacen_posicion UNIQUE (id_almacen, pasillo, estanteria, nivel, casillero)
);

-- 5. TABLA DE PRODUCTOS
CREATE TABLE IF NOT EXISTS productos (
    id_producto SERIAL PRIMARY KEY,
    codigo_barras VARCHAR(50) UNIQUE NOT NULL,
    nombre VARCHAR(150) NOT NULL,
    descripcion TEXT,
    precio_costo NUMERIC(10, 2) DEFAULT 0.00 CHECK (precio_costo >= 0),
    precio_venta NUMERIC(10, 2) DEFAULT 0.00 CHECK (precio_venta >= 0),
    stock_actual INT NOT NULL DEFAULT 0 CHECK (stock_actual >= 0),
    stock_minimo INT NOT NULL DEFAULT 0 CHECK (stock_minimo >= 0),
    creado_en TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 6. TABLA DE LOTES (Trazabilidad y Control FEFO de Fechas de Vencimiento)
CREATE TABLE IF NOT EXISTS lotes (
    id_lote SERIAL PRIMARY KEY,
    id_producto INT NOT NULL REFERENCES productos(id_producto) ON DELETE RESTRICT,
    numero_lote VARCHAR(100) NOT NULL,
    fecha_fabricacion DATE,
    fecha_vencimiento DATE NOT NULL,
    creado_en TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_producto_lote UNIQUE (id_producto, numero_lote)
);

-- 7. TABLA DE INVENTARIO GRANULAR POR UBICACIÓN Y LOTE (Stock Físico)
CREATE TABLE IF NOT EXISTS inventario_ubicaciones (
    id_inventario SERIAL PRIMARY KEY,
    id_ubicacion INT NOT NULL REFERENCES ubicaciones(id_ubicacion) ON DELETE RESTRICT,
    id_producto INT NOT NULL REFERENCES productos(id_producto) ON DELETE RESTRICT,
    id_lote INT NOT NULL REFERENCES lotes(id_lote) ON DELETE RESTRICT,
    cantidad INT NOT NULL DEFAULT 0 CHECK (cantidad >= 0),
    CONSTRAINT uq_stock_ubicacion_lote UNIQUE (id_ubicacion, id_producto, id_lote)
);

-- 8. TABLA DE TRANSFERENCIAS INTERNAS ENTRE ALMACENES / UBICACIONES
CREATE TABLE IF NOT EXISTS transferencias (
    id_transferencia SERIAL PRIMARY KEY,
    id_usuario INT NOT NULL REFERENCES usuarios(id_usuario) ON DELETE RESTRICT,
    id_almacen_origen INT NOT NULL REFERENCES almacenes(id_almacen) ON DELETE RESTRICT,
    id_almacen_destino INT NOT NULL REFERENCES almacenes(id_almacen) ON DELETE RESTRICT,
    fecha_transferencia TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    estado VARCHAR(20) NOT NULL DEFAULT 'COMPLETADA' CHECK (estado IN ('PENDIENTE', 'COMPLETADA', 'CANCELADA')),
    observacion TEXT,
    creado_en TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 9. TABLA DE DETALLE DE TRANSFERENCIAS (Líneas de Traslado)
CREATE TABLE IF NOT EXISTS detalle_transferencias (
    id_detalle SERIAL PRIMARY KEY,
    id_transferencia INT NOT NULL REFERENCES transferencias(id_transferencia) ON DELETE CASCADE,
    id_producto INT NOT NULL REFERENCES productos(id_producto) ON DELETE RESTRICT,
    id_lote INT NOT NULL REFERENCES lotes(id_lote) ON DELETE RESTRICT,
    id_ubicacion_origen INT NOT NULL REFERENCES ubicaciones(id_ubicacion) ON DELETE RESTRICT,
    id_ubicacion_destino INT NOT NULL REFERENCES ubicaciones(id_ubicacion) ON DELETE RESTRICT,
    cantidad INT NOT NULL CHECK (cantidad > 0)
);

-- 10. TABLA DE TIPOS DE MOVIMIENTO
CREATE TABLE IF NOT EXISTS tipos_movimiento (
    id_tipo SERIAL PRIMARY KEY,
    nombre VARCHAR(50) NOT NULL,
    factor SMALLINT NOT NULL CHECK (factor IN (1, -1, 0)),
    descripcion TEXT
);

-- 11. TABLA DE MOVIMIENTOS AUDITORÍA (Kardex Detallado con trazabilidad WMS)
CREATE TABLE IF NOT EXISTS movimientos (
    id_movimiento SERIAL PRIMARY KEY,
    id_producto INT NOT NULL REFERENCES productos(id_producto) ON DELETE RESTRICT,
    id_lote INT REFERENCES lotes(id_lote) ON DELETE SET NULL,
    id_tipo INT NOT NULL REFERENCES tipos_movimiento(id_tipo) ON DELETE RESTRICT,
    id_ubicacion_origen INT REFERENCES ubicaciones(id_ubicacion) ON DELETE SET NULL,
    id_ubicacion_destino INT REFERENCES ubicaciones(id_ubicacion) ON DELETE SET NULL,
    cantidad INT NOT NULL CHECK (cantidad > 0),
    costo_unitario NUMERIC(10, 2),
    id_usuario INT REFERENCES usuarios(id_usuario) ON DELETE SET NULL,
    observacion TEXT,
    fecha_movimiento TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- ==============================================================================
-- ÍNDICES DE RENDIMIENTO (Performance para Consultas FEFO y Kardex)
-- ==============================================================================
CREATE INDEX IF NOT EXISTS idx_lotes_fefo ON lotes(id_producto, fecha_vencimiento ASC);
CREATE INDEX IF NOT EXISTS idx_inv_ubicacion_prod ON inventario_ubicaciones(id_producto, cantidad) WHERE cantidad > 0;
CREATE INDEX IF NOT EXISTS idx_ubicaciones_almacen ON ubicaciones(id_almacen);
CREATE INDEX IF NOT EXISTS idx_transferencias_fecha ON transferencias(fecha_transferencia DESC);
CREATE INDEX IF NOT EXISTS idx_movimientos_prod_fecha ON movimientos(id_producto, fecha_movimiento DESC);

-- ==============================================================================
-- DML: DATOS SEMILLA (SEEDS)
-- ==============================================================================

-- Inserción de Roles
INSERT INTO roles (id_rol, nombre, descripcion) VALUES
    (1, 'ADMIN', 'Acceso total al sistema y configuraciones'),
    (2, 'JEFE_ALMACEN', 'Gestión de entradas, salidas, transferencias y lotes'),
    (3, 'OPERARIO', 'Registro diario de inventario y picking')
ON CONFLICT (id_rol) DO UPDATE SET nombre = EXCLUDED.nombre, descripcion = EXCLUDED.descripcion;
SELECT setval('roles_id_rol_seq', COALESCE((SELECT MAX(id_rol) FROM roles), 1));

-- Inserción de Usuarios por Defecto (Password: Admin1234!, Jefe1234!, Operario1234!)
INSERT INTO usuarios (id_usuario, id_rol, nombre, email, password_hash, activo) VALUES
    (1, 1, 'Administrador General', 'admin@almacen.com', '$2b$10$rggNwvzN7E8ROyk.17GjyefoDxE82pAbv5ql2VdOwC/RdHUYzJwXm', TRUE),
    (2, 2, 'Carlos Mendoza (Jefe)', 'jefe@almacen.com', '$2b$10$Xp055p.GTVXcFiGY63uYteTXvcCwrPxB4TVfklpgJQAcnMD16sjqe', TRUE),
    (3, 3, 'Luis Ramírez (Operario)', 'operario@almacen.com', '$2b$10$kF3k9Zn2SHm1ICNaKTv2UuUu.DVJEcR6grgKKQzml3nMRY9APlDtm', TRUE)
ON CONFLICT (email) DO NOTHING;
SELECT setval('usuarios_id_usuario_seq', COALESCE((SELECT MAX(id_usuario) FROM usuarios), 1));

-- Inserción de Almacenes
INSERT INTO almacenes (id_almacen, codigo, nombre, direccion, activo) VALUES
    (1, 'ALM-CENTRAL', 'Almacén Central Principal', 'Av. Industrial 500, Sede Central', TRUE),
    (2, 'ALM-SECUNDARIO', 'Depósito Auxiliar Norte', 'Calle Comercio 120, Norte', TRUE)
ON CONFLICT (id_almacen) DO UPDATE SET nombre = EXCLUDED.nombre;
SELECT setval('almacenes_id_almacen_seq', COALESCE((SELECT MAX(id_almacen) FROM almacenes), 1));

-- Inserción de Ubicaciones
INSERT INTO ubicaciones (id_ubicacion, id_almacen, pasillo, estanteria, nivel, casillero, codigo_ubicacion, capacidad_maxima, activo) VALUES
    (1, 1, 'P01', 'E01', 'N01', 'C01', 'ALM-CENTRAL-P01-E01-N01-C01', 1000.00, TRUE),
    (2, 1, 'P01', 'E01', 'N01', 'C02', 'ALM-CENTRAL-P01-E01-N01-C02', 1000.00, TRUE),
    (3, 2, 'P02', 'E01', 'N01', 'C01', 'ALM-SECUNDARIO-P02-E01-N01-C01', 1000.00, TRUE)
ON CONFLICT (codigo_ubicacion) DO NOTHING;
SELECT setval('ubicaciones_id_ubicacion_seq', COALESCE((SELECT MAX(id_ubicacion) FROM ubicaciones), 1));

-- Inserción de Tipos de Movimiento
INSERT INTO tipos_movimiento (id_tipo, nombre, factor, descripcion) VALUES
    (1, 'ENTRADA_COMPRA', 1, 'Ingreso de mercadería por compra a proveedor'),
    (2, 'SALIDA_VENTA', -1, 'Despacho de mercadería por venta'),
    (3, 'TRANSFERENCIA_INTERNA', 0, 'Reubicación de mercadería entre casilleros o almacenes'),
    (4, 'AJUSTE_POSITIVO', 1, 'Ingreso por sobrante en reconteo de inventario'),
    (5, 'AJUSTE_NEGATIVO', -1, 'Salida por merma, rotura o caducidad')
ON CONFLICT (id_tipo) DO UPDATE SET nombre = EXCLUDED.nombre, factor = EXCLUDED.factor;
SELECT setval('tipos_movimiento_id_tipo_seq', COALESCE((SELECT MAX(id_tipo) FROM tipos_movimiento), 1));
