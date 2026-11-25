-- ==========================================================
-- SCRIPT OFICIAL Y DEFINITIVO - SISTEMA WMS (9 TABLAS)
-- ROLES EXCLUSIVOS PERMITIDOS:
--   1: Administrador
--   2: Operario
-- ==========================================================

-- 1. CREAR TABLAS SIN BORRAR NI ALTERAR DATOS EXISTENTES

-- 2. CREAR LAS TABLAS OFICIALES CON RESTRICCIÓN ESTRICTA DE ROLES
CREATE TABLE IF NOT EXISTS roles (
    id_rol INT PRIMARY KEY CHECK (id_rol IN (1, 2)),
    nombre VARCHAR(50) UNIQUE NOT NULL CHECK (nombre IN ('Administrador', 'Operario')),
    descripcion TEXT
);

CREATE TABLE IF NOT EXISTS usuarios (
    id_usuario SERIAL PRIMARY KEY,
    nombre VARCHAR(100) NOT NULL,
    email VARCHAR(100) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    id_rol INT NOT NULL REFERENCES roles(id_rol) ON DELETE RESTRICT CHECK (id_rol IN (1, 2)),
    estado BOOLEAN DEFAULT TRUE,
    fecha_creacion TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS almacenes (
    id_almacen SERIAL PRIMARY KEY,
    codigo VARCHAR(20) UNIQUE NOT NULL,
    nombre VARCHAR(100) NOT NULL,
    ubicacion TEXT,
    direccion TEXT
);

CREATE TABLE IF NOT EXISTS productos (
    id_producto SERIAL PRIMARY KEY,
    codigo_barras VARCHAR(50) UNIQUE NOT NULL,
    nombre VARCHAR(150) NOT NULL,
    categoria VARCHAR(100),
    descripcion TEXT,
    precio NUMERIC(10,2) DEFAULT 0.00,
    precio_costo NUMERIC(10,2) NOT NULL DEFAULT 0.00,
    precio_venta NUMERIC(10,2) NOT NULL DEFAULT 0.00,
    stock_minimo INT NOT NULL DEFAULT 10 CHECK (stock_minimo >= 0)
);

CREATE TABLE IF NOT EXISTS lotes (
    id_lote SERIAL PRIMARY KEY,
    id_producto INT REFERENCES productos(id_producto) ON DELETE CASCADE,
    numero_lote VARCHAR(50) NOT NULL,
    fecha_vencimiento DATE NOT NULL,
    UNIQUE(id_producto, numero_lote)
);

CREATE TABLE IF NOT EXISTS inventario (
    id_inventario SERIAL PRIMARY KEY,
    id_almacen INT REFERENCES almacenes(id_almacen) ON DELETE CASCADE,
    id_producto INT REFERENCES productos(id_producto) ON DELETE CASCADE,
    id_lote INT REFERENCES lotes(id_lote) ON DELETE CASCADE,
    cantidad INT NOT NULL DEFAULT 0 CHECK (cantidad >= 0),
    stock_minimo INT NOT NULL DEFAULT 10 CHECK (stock_minimo >= 0),
    UNIQUE(id_almacen, id_producto, id_lote)
);

CREATE TABLE IF NOT EXISTS movimientos (
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

CREATE TABLE IF NOT EXISTS transferencias (
    id_transferencia SERIAL PRIMARY KEY,
    id_almacen_origen INT REFERENCES almacenes(id_almacen),
    id_almacen_destino INT REFERENCES almacenes(id_almacen),
    id_usuario INT REFERENCES usuarios(id_usuario),
    fecha TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    estado VARCHAR(30) DEFAULT 'Completado'
);

CREATE TABLE IF NOT EXISTS detalle_transferencias (
    id_detalle SERIAL PRIMARY KEY,
    id_transferencia INT REFERENCES transferencias(id_transferencia) ON DELETE CASCADE,
    id_producto INT REFERENCES productos(id_producto),
    id_lote INT REFERENCES lotes(id_lote),
    cantidad INT NOT NULL CHECK (cantidad > 0)
);

-- Actualización aditiva para bases creadas con versiones previas del esquema.
ALTER TABLE almacenes ADD COLUMN IF NOT EXISTS direccion TEXT;
ALTER TABLE productos ADD COLUMN IF NOT EXISTS precio_costo NUMERIC(10,2) NOT NULL DEFAULT 0.00;
ALTER TABLE productos ADD COLUMN IF NOT EXISTS precio_venta NUMERIC(10,2) NOT NULL DEFAULT 0.00;
ALTER TABLE productos ADD COLUMN IF NOT EXISTS stock_minimo INT NOT NULL DEFAULT 10;
ALTER TABLE inventario ADD COLUMN IF NOT EXISTS stock_minimo INT NOT NULL DEFAULT 10;

-- 3. DATOS INICIALES (SEEDS) - EXCLUSIVAMENTE ADMINISTRADOR (1) Y OPERARIO (2)
INSERT INTO roles (id_rol, nombre, descripcion) VALUES 
(1, 'Administrador', 'Control total del sistema, catálogos y gestión de usuarios'),
(2, 'Operario', 'Gestión de entradas, salidas y consulta de inventario por almacén')
ON CONFLICT DO NOTHING;

INSERT INTO almacenes (id_almacen, codigo, nombre, ubicacion, direccion) VALUES
(1, 'ALM-1', 'Almacén Central', 'Sede Principal', 'Sede Principal')
ON CONFLICT (id_almacen) DO NOTHING;

-- Usuario Administrador Oficial
-- Correo: admin@almacen.com | Contraseña: admin123
INSERT INTO usuarios (id_usuario, nombre, email, password_hash, id_rol, estado) 
VALUES (
    1,
    'Administrador', 
    'admin@almacen.com', 
    '$2b$10$Ihr2DMzDVrRpZpixV0oAMOZBOE0Twx8Ms5VV8Zr3EwyPMpoLOfjDK',
    1, 
    TRUE
)
ON CONFLICT DO NOTHING;

-- Usuario Operario Oficial
-- Correo: operario@almacen.com | Contraseña: admin123
INSERT INTO usuarios (id_usuario, nombre, email, password_hash, id_rol, estado) 
VALUES (
    2,
    'Operario', 
    'operario@almacen.com', 
    '$2b$10$Ihr2DMzDVrRpZpixV0oAMOZBOE0Twx8Ms5VV8Zr3EwyPMpoLOfjDK',
    2, 
    TRUE
)
ON CONFLICT DO NOTHING;

-- Sincronizar secuencia de autoincremento para id_usuario
-- Avanzar la secuencia si hace falta, sin retrocederla en una base activa.
SELECT setval(
    'usuarios_id_usuario_seq',
    GREATEST(
        COALESCE((SELECT MAX(id_usuario) FROM usuarios), 1),
        (SELECT last_value FROM usuarios_id_usuario_seq)
    ),
    TRUE
);
