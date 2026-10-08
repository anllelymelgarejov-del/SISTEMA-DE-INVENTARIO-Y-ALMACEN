-- ========================================================
-- Script de Creación de Base de Datos y Tablas
-- Base de Datos: inventario_db
-- ========================================================

-- 1. Tabla de Productos
CREATE TABLE IF NOT EXISTS productos (
    id_producto SERIAL PRIMARY KEY,
    codigo_barras VARCHAR(50) UNIQUE NOT NULL,
    nombre VARCHAR(150) NOT NULL,
    descripcion TEXT,
    precio_unitario NUMERIC(10, 2) NOT NULL CHECK (precio_unitario >= 0),
    stock_actual INT NOT NULL DEFAULT 0 CHECK (stock_actual >= 0),
    stock_minimo INT NOT NULL DEFAULT 0 CHECK (stock_minimo >= 0)
);

-- 2. Tabla de Tipos de Movimiento (Kardex / Flujo)
CREATE TABLE IF NOT EXISTS tipos_movimiento (
    id_tipo SERIAL PRIMARY KEY,
    nombre VARCHAR(50) NOT NULL,
    factor SMALLINT NOT NULL CHECK (factor IN (1, -1))
);

-- 3. Tabla de Movimientos de Inventario
CREATE TABLE IF NOT EXISTS movimientos (
    id_movimiento SERIAL PRIMARY KEY,
    id_producto INT NOT NULL REFERENCES productos(id_producto) ON DELETE RESTRICT,
    id_tipo INT NOT NULL REFERENCES tipos_movimiento(id_tipo) ON DELETE RESTRICT,
    cantidad INT NOT NULL CHECK (cantidad > 0),
    fecha_movimiento TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    observacion TEXT
);

-- Índices recomendados para optimización de consultas
CREATE INDEX IF NOT EXISTS idx_movimientos_producto ON movimientos(id_producto);
CREATE INDEX IF NOT EXISTS idx_movimientos_fecha ON movimientos(fecha_movimiento);
CREATE INDEX IF NOT EXISTS idx_productos_stock_alerta ON productos(stock_actual, stock_minimo);

-- ========================================================
-- Datos iniciales recomendados (Semilla / Seeds)
-- ========================================================

-- Insertar tipos de movimiento estándar si no existen
INSERT INTO tipos_movimiento (id_tipo, nombre, factor) VALUES
    (1, 'Entrada por compra', 1),
    (2, 'Salida por venta', -1),
    (3, 'Entrada por ajuste', 1),
    (4, 'Salida por merma/daño', -1)
ON CONFLICT (id_tipo) DO NOTHING;

-- Reiniciar la secuencia al máximo id_tipo actual
SELECT setval('tipos_movimiento_id_tipo_seq', COALESCE((SELECT MAX(id_tipo) FROM tipos_movimiento), 1));
