-- ==========================================================
-- SCRIPT OFICIAL Y DEFINITIVO - SISTEMA WMS (9 TABLAS)
-- ROLES EXCLUSIVOS PERMITIDOS:
--   1: Administrador
--   2: Operario
-- ==========================================================

-- 1. ELIMINAR TABLAS EXISTENTES (Orden inverso por dependencias)
DROP TABLE IF EXISTS detalle_transferencias CASCADE;
DROP TABLE IF EXISTS transferencias CASCADE;
DROP TABLE IF EXISTS movimientos CASCADE;
DROP TABLE IF EXISTS inventario CASCADE;
DROP TABLE IF EXISTS lotes CASCADE;
DROP TABLE IF EXISTS productos CASCADE;
DROP TABLE IF EXISTS almacenes CASCADE;
DROP TABLE IF EXISTS usuarios CASCADE;
DROP TABLE IF EXISTS roles CASCADE;
DROP TABLE IF EXISTS tipos_movimiento CASCADE;

-- 2. CREAR LAS TABLAS OFICIALES CON RESTRICCIÓN ESTRICTA DE ROLES
CREATE TABLE roles (
    id_rol INT PRIMARY KEY CHECK (id_rol IN (1, 2)),
    nombre VARCHAR(50) UNIQUE NOT NULL CHECK (nombre IN ('Administrador', 'Operario')),
    descripcion TEXT
);

CREATE TABLE usuarios (
    id_usuario SERIAL PRIMARY KEY,
    nombre VARCHAR(100) NOT NULL,
    email VARCHAR(100) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    id_rol INT NOT NULL REFERENCES roles(id_rol) ON DELETE RESTRICT CHECK (id_rol IN (1, 2)),
    estado BOOLEAN DEFAULT TRUE,
    fecha_creacion TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE almacenes (
    id_almacen SERIAL PRIMARY KEY,
    codigo VARCHAR(20) UNIQUE NOT NULL,
    nombre VARCHAR(100) NOT NULL,
    ubicacion TEXT
);

CREATE TABLE productos (
    id_producto SERIAL PRIMARY KEY,
    codigo_barras VARCHAR(50) UNIQUE NOT NULL,
    nombre VARCHAR(150) NOT NULL,
    categoria VARCHAR(100),
    descripcion TEXT,
    precio NUMERIC(10,2) DEFAULT 0.00
);

CREATE TABLE lotes (
    id_lote SERIAL PRIMARY KEY,
    id_producto INT REFERENCES productos(id_producto) ON DELETE CASCADE,
    numero_lote VARCHAR(50) NOT NULL,
    fecha_vencimiento DATE NOT NULL,
    UNIQUE(id_producto, numero_lote)
);

CREATE TABLE inventario (
    id_inventario SERIAL PRIMARY KEY,
    id_almacen INT REFERENCES almacenes(id_almacen) ON DELETE CASCADE,
    id_producto INT REFERENCES productos(id_producto) ON DELETE CASCADE,
    id_lote INT REFERENCES lotes(id_lote) ON DELETE CASCADE,
    cantidad INT NOT NULL DEFAULT 0 CHECK (cantidad >= 0),
    UNIQUE(id_almacen, id_producto, id_lote)
);

CREATE TABLE movimientos (
    id_movimiento SERIAL PRIMARY KEY,
    id_almacen INT REFERENCES almacenes(id_almacen) ON DELETE CASCADE,
    id_producto INT REFERENCES productos(id_producto) ON DELETE CASCADE,
    id_lote INT REFERENCES lotes(id_lote) ON DELETE CASCADE,
    id_usuario INT REFERENCES usuarios(id_usuario) ON DELETE SET NULL,
    tipo VARCHAR(20) NOT NULL, 
    cantidad INT NOT NULL,
    fecha TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    observacion TEXT
);

CREATE TABLE transferencias (
    id_transferencia SERIAL PRIMARY KEY,
    id_almacen_origen INT REFERENCES almacenes(id_almacen),
    id_almacen_destino INT REFERENCES almacenes(id_almacen),
    id_usuario INT REFERENCES usuarios(id_usuario),
    fecha TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    estado VARCHAR(30) DEFAULT 'Completado'
);

CREATE TABLE detalle_transferencias (
    id_detalle SERIAL PRIMARY KEY,
    id_transferencia INT REFERENCES transferencias(id_transferencia) ON DELETE CASCADE,
    id_producto INT REFERENCES productos(id_producto),
    id_lote INT REFERENCES lotes(id_lote),
    cantidad INT NOT NULL CHECK (cantidad > 0)
);

-- 3. DATOS INICIALES (SEEDS) - EXCLUSIVAMENTE ADMINISTRADOR (1) Y OPERARIO (2)
INSERT INTO roles (id_rol, nombre, descripcion) VALUES 
(1, 'Administrador', 'Control total del sistema, catálogos y gestión de usuarios'),
(2, 'Operario', 'Gestión de entradas, salidas y consulta de inventario por almacén')
ON CONFLICT (id_rol) DO UPDATE SET 
    nombre = EXCLUDED.nombre, 
    descripcion = EXCLUDED.descripcion;

INSERT INTO almacenes (id_almacen, codigo, nombre, ubicacion) VALUES 
(1, 'ALM-1', 'Almacén Central', 'Sede Principal')
ON CONFLICT (id_almacen) DO NOTHING;

-- Usuario Administrador Oficial
-- Correo: admin@almacen.com | Contraseña: admin123
INSERT INTO usuarios (id_usuario, nombre, email, password_hash, id_rol, estado) 
VALUES (
    1,
    'Administrador', 
    'admin@almacen.com', 
    '$2b$10$39WlB3u6f709V2R0NfW/U.L4m4hYw8oH0L3K3b9Uv4O3c6W5G3XvO', 
    1, 
    TRUE
)
ON CONFLICT (email) DO UPDATE SET 
    nombre = EXCLUDED.nombre,
    id_rol = 1;

-- Usuario Operario Oficial
-- Correo: operario@almacen.com | Contraseña: admin123
INSERT INTO usuarios (id_usuario, nombre, email, password_hash, id_rol, estado) 
VALUES (
    2,
    'Operario', 
    'operario@almacen.com', 
    '$2b$10$39WlB3u6f709V2R0NfW/U.L4m4hYw8oH0L3K3b9Uv4O3c6W5G3XvO', 
    2, 
    TRUE
)
ON CONFLICT (email) DO UPDATE SET 
    nombre = EXCLUDED.nombre,
    id_rol = 2;

-- Sincronizar secuencia de autoincremento para id_usuario
SELECT setval('usuarios_id_usuario_seq', COALESCE((SELECT MAX(id_usuario) FROM usuarios), 1));