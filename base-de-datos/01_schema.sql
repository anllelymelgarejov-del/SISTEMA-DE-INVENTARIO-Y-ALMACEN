-- ========================================================
-- SISTEMA DE GESTIÓN DE INVENTARIO Y ALMACÉN (SGI-ALMACÉN)
-- Script Inicial de Base de Datos - PostgreSQL
-- Responsable: Anllely Melgarejo
-- ========================================================

-- 1. Tabla de Roles y Usuarios (RBAC)
CREATE TYPE rol_usuario AS ENUM ('ADMINISTRADOR', 'ALMACENERO', 'CONSULTA');

CREATE TABLE usuarios (
    id SERIAL PRIMARY KEY,
    nombre VARCHAR(100) NOT NULL,
    email VARCHAR(100) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    rol rol_usuario NOT NULL DEFAULT 'CONSULTA',
    creado_en TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 2. Tabla de Catálogo Maestro de Artículos
CREATE TYPE estado_articulo AS ENUM ('ACTIVO', 'INACTIVO', 'DESCONTINUADO');

CREATE TABLE articulos (
    id SERIAL PRIMARY KEY,
    sku VARCHAR(50) UNIQUE NOT NULL,
    codigo_barras VARCHAR(100) UNIQUE,
    nombre VARCHAR(150) NOT NULL,
    descripcion TEXT,
    categoria VARCHAR(100) NOT NULL,
    unidad_medida VARCHAR(20) NOT NULL, -- Unidad, Paquete, Caja
    precio_compra NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    precio_salida NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    costo_promedio NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    stock_minimo INT NOT NULL DEFAULT 0,
    stock_seguridad INT NOT NULL DEFAULT 0,
    stock_maximo INT NOT NULL DEFAULT 0,
    ubicacion_zona VARCHAR(50),
    ubicacion_estante VARCHAR(50),
    ubicacion_fila VARCHAR(50),
    estado estado_articulo DEFAULT 'ACTIVO',
    creado_en TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 3. Tabla de Lotes (Soporte FEFO y Bloqueo de Stock Negativo)
CREATE TABLE lotes (
    id SERIAL PRIMARY KEY,
    articulo_id INT NOT NULL REFERENCES articulos(id) ON DELETE RESTRICT,
    numero_lote VARCHAR(50) NOT NULL,
    fecha_vencimiento DATE, -- Fecha clave para la salida FEFO
    stock_disponible INT NOT NULL DEFAULT 0 CHECK (stock_disponible >= 0), -- Bloqueo negativo
    costo_unitario NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    creado_en TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 4. Tabla de Kárdex Inmutable (Solo registros INSERT)
CREATE TYPE tipo_movimiento AS ENUM ('ENTRADA', 'SALIDA', 'AJUSTE_SOBRANTE', 'AJUSTE_FALTANTE');

CREATE TABLE kardex (
    id BIGSERIAL PRIMARY KEY,
    articulo_id INT NOT NULL REFERENCES articulos(id) ON DELETE RESTRICT,
    lote_id INT REFERENCES lotes(id) ON DELETE RESTRICT,
    usuario_id INT NOT NULL REFERENCES usuarios(id),
    tipo tipo_movimiento NOT NULL,
    documento_sustento VARCHAR(100) NOT NULL, -- Factura, Guía de Remisión, Vale N°
    cantidad INT NOT NULL CHECK (cantidad > 0),
    costo_unitario NUMERIC(12, 2) NOT NULL,
    costo_total NUMERIC(12, 2) NOT NULL,
    saldo_cantidad INT NOT NULL CHECK (saldo_cantidad >= 0),
    saldo_valorizado NUMERIC(12, 2) NOT NULL,
    creado_en TIMESTAMP DEFAULT CURRENT_TIMESTAMP -- Inmutable
);

-- Índices para búsquedas ultra rápidas con escáner USB
CREATE INDEX idx_articulos_barcode ON articulos(codigo_barras);
CREATE INDEX idx_articulos_sku ON articulos(sku);
CREATE INDEX idx_lotes_fefo ON lotes(articulo_id, fecha_vencimiento ASC);