-- database/schema.sql

-- 1. Tabla de Roles
CREATE TABLE IF NOT EXISTS roles (
    id_rol SERIAL PRIMARY KEY,
    nombre VARCHAR(50) NOT NULL UNIQUE
);

INSERT INTO roles (id_rol, nombre) VALUES 
(1, 'ADMIN'), 
(2, 'OPERARIO') 
ON CONFLICT (id_rol) DO NOTHING;

-- 2. Tabla de Usuarios
CREATE TABLE IF NOT EXISTS usuarios (
    id_usuario SERIAL PRIMARY KEY,
    nombre VARCHAR(100) NOT NULL,
    email VARCHAR(100) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    id_rol INT REFERENCES roles(id_rol) ON DELETE RESTRICT
);

-- 3. Tabla de Almacenes
CREATE TABLE IF NOT EXISTS almacenes (
    id_almacen SERIAL PRIMARY KEY,
    nombre VARCHAR(100) NOT NULL,
    direccion VARCHAR(255)
);

-- 4. Tabla de Productos (Catálogo Maestro)
CREATE TABLE IF NOT EXISTS productos (
    id_producto SERIAL PRIMARY KEY,
    codigo_barras VARCHAR(100) UNIQUE NOT NULL,
    nombre VARCHAR(150) NOT NULL,
    descripcion TEXT,
    precio_costo NUMERIC(10,2) DEFAULT 0.00,
    precio_venta NUMERIC(10,2) DEFAULT 0.00
);

-- 5. Tabla de Lotes
CREATE TABLE IF NOT EXISTS lotes (
    id_lote SERIAL PRIMARY KEY,
    id_producto INT REFERENCES productos(id_producto) ON DELETE CASCADE,
    numero_lote VARCHAR(100) NOT NULL,
    fecha_vencimiento DATE NOT NULL
);

-- 6. Tabla de Inventario / Stock
CREATE TABLE IF NOT EXISTS inventario (
    id_inventario SERIAL PRIMARY KEY,
    id_almacen INT REFERENCES almacenes(id_almacen) ON DELETE CASCADE,
    id_producto INT REFERENCES productos(id_producto) ON DELETE CASCADE,
    id_lote INT REFERENCES lotes(id_lote) ON DELETE CASCADE,
    cantidad INT NOT NULL CHECK (cantidad >= 0)
);

-- 7. Tabla de Historial de Movimientos
CREATE TABLE IF NOT EXISTS movimientos (
    id_movimiento SERIAL PRIMARY KEY,
    tipo VARCHAR(10) CHECK (tipo IN ('ENTRADA', 'SALIDA')),
    id_almacen INT REFERENCES almacenes(id_almacen),
    id_producto INT REFERENCES productos(id_producto),
    id_lote INT REFERENCES lotes(id_lote),
    cantidad INT NOT NULL,
    id_usuario INT REFERENCES usuarios(id_usuario),
    fecha TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);