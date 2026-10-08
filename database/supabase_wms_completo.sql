-- ==============================================================================
-- SCRIPT DE MIGRACIÓN COMPLETA PARA SUPABASE (POSTGRESQL CLOUD)
-- Sistema de Gestión de Almacenes (WMS Enterprise)
-- ==============================================================================
-- Instrucciones para Supabase:
-- 1. Inicia sesión en https://supabase.com y entra a tu proyecto.
-- 2. Ve a la pestaña lateral "SQL Editor" (ícono de consola).
-- 3. Crea una "New Query", pega la totalidad de este script y presiona "RUN".
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
    codigo_ubicacion VARCHAR(50) UNIQUE NOT NULL,
    capacidad_maxima NUMERIC(10, 2) DEFAULT 1000.00,
    activo BOOLEAN NOT NULL DEFAULT TRUE,
    CONSTRAINT uq_almacen_posicion UNIQUE (id_almacen, pasillo, estanteria, nivel, casillero)
);

-- 5. TABLA DE PRODUCTOS (SKUs)
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

-- 6. TABLA DE LOTES (Trazabilidad y Control FEFO de Vencimientos)
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
    cantidad INT NOT NULL DEFAULT 0,
    CONSTRAINT uq_stock_ubicacion_lote UNIQUE (id_ubicacion, id_producto, id_lote),
    CONSTRAINT chk_stock_no_negativo CHECK (cantidad >= 0)
);

-- 8. TABLA DE TRANSFERENCIAS INTERNAS (Cabecera)
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
    cantidad INT NOT NULL CHECK (cantidad > 0),
    CONSTRAINT chk_transferencia_distinta_ubicacion CHECK (id_ubicacion_origen != id_ubicacion_destino)
);

-- 10. TABLA DE TIPOS DE MOVIMIENTO
CREATE TABLE IF NOT EXISTS tipos_movimiento (
    id_tipo SERIAL PRIMARY KEY,
    nombre VARCHAR(50) NOT NULL,
    factor SMALLINT NOT NULL CHECK (factor IN (1, -1, 0)),
    descripcion TEXT
);

-- 11. TABLA DE MOVIMIENTOS AUDITORÍA (Kardex Integral WMS)
CREATE TABLE IF NOT EXISTS movimientos (
    id_movimiento SERIAL PRIMARY KEY,
    id_producto INT NOT NULL REFERENCES productos(id_producto) ON DELETE RESTRICT,
    id_lote INT REFERENCES lotes(id_lote) ON DELETE SET NULL,
    id_tipo INT NOT NULL REFERENCES tipos_movimiento(id_tipo) ON DELETE RESTRICT,
    id_ubicacion_origen INT REFERENCES ubicaciones(id_ubicacion) ON DELETE SET NULL,
    id_ubicacion_destino INT REFERENCES ubicaciones(id_ubicacion) ON DELETE SET NULL,
    cantidad INT NOT NULL CHECK (cantidad > 0),
    costo_unitario NUMERIC(10, 2) DEFAULT 0.00,
    id_usuario INT REFERENCES usuarios(id_usuario) ON DELETE SET NULL,
    observacion TEXT,
    fecha_movimiento TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT chk_movimiento_distinta_ubicacion CHECK (
        id_ubicacion_origen IS NULL 
        OR id_ubicacion_destino IS NULL 
        OR id_ubicacion_origen != id_ubicacion_destino
    )
);

-- ==============================================================================
-- ÍNDICES DE ALTO RENDIMIENTO (FEFO, Auditoría y Ubicaciones)
-- ==============================================================================
CREATE INDEX IF NOT EXISTS idx_lotes_fefo ON lotes(id_producto, fecha_vencimiento ASC);
CREATE INDEX IF NOT EXISTS idx_inv_ubicacion_prod ON inventario_ubicaciones(id_producto, cantidad) WHERE cantidad > 0;
CREATE INDEX IF NOT EXISTS idx_ubicaciones_almacen ON ubicaciones(id_almacen);
CREATE INDEX IF NOT EXISTS idx_transferencias_fecha ON transferencias(fecha_transferencia DESC);
CREATE INDEX IF NOT EXISTS idx_movimientos_prod_fecha ON movimientos(id_producto, fecha_movimiento DESC);

-- ==============================================================================
-- TRIGGER PL/PGSQL: BLOQUEO DE SALIDAS DE LOTES CADUCADOS
-- ==============================================================================
CREATE OR REPLACE FUNCTION fn_bloquear_salida_lote_vencido()
RETURNS TRIGGER AS $$
DECLARE
    v_fecha_vencimiento DATE;
    v_numero_lote VARCHAR(100);
    v_factor INT;
    v_nombre_tipo VARCHAR(50);
BEGIN
    IF NEW.id_lote IS NOT NULL THEN
        SELECT t.factor, t.nombre 
        INTO v_factor, v_nombre_tipo
        FROM tipos_movimiento t
        WHERE t.id_tipo = NEW.id_tipo;

        IF v_factor < 0 OR v_nombre_tipo ILIKE '%SALIDA%' OR v_nombre_tipo ILIKE '%DESPACHO%' THEN
            SELECT l.fecha_vencimiento, l.numero_lote
            INTO v_fecha_vencimiento, v_numero_lote
            FROM lotes l
            WHERE l.id_lote = NEW.id_lote;

            IF v_fecha_vencimiento IS NOT NULL AND v_fecha_vencimiento < CURRENT_DATE THEN
                RAISE EXCEPTION 'El lote [%] se encuentra vencido desde el %. No está permitido registrar salidas o despachos de lotes expirados.',
                    v_numero_lote, v_fecha_vencimiento
                    USING ERRCODE = '23514';
            END IF;
        END IF;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_bloquear_salida_lote_vencido ON movimientos;
CREATE TRIGGER trg_bloquear_salida_lote_vencido
BEFORE INSERT OR UPDATE ON movimientos
FOR EACH ROW
EXECUTE FUNCTION fn_bloquear_salida_lote_vencido();

-- ==============================================================================
-- DATOS SEMILLA (SEEDS INICIALES PARA PRUEBAS INMEDIATAS)
-- ==============================================================================

-- 1. Roles
INSERT INTO roles (id_rol, nombre, descripcion) VALUES
    (1, 'ADMIN', 'Acceso total al sistema y configuraciones'),
    (2, 'JEFE_ALMACEN', 'Gestión de entradas, salidas, transferencias y lotes'),
    (3, 'OPERARIO', 'Registro diario de inventario y picking')
ON CONFLICT (id_rol) DO UPDATE SET nombre = EXCLUDED.nombre;
SELECT setval('roles_id_rol_seq', COALESCE((SELECT MAX(id_rol) FROM roles), 1));

-- 2. Usuarios con contraseña cifrada (Admin1234!, Jefe1234!, Operario1234!)
INSERT INTO usuarios (id_usuario, id_rol, nombre, email, password_hash, activo) VALUES
    (1, 1, 'Administrador General', 'admin@almacen.com', '$2b$10$j3w3qXRut6jJTne6Al8ZluimbQJmMWgB/vTaAlNNNHkyH13EvgdRO', TRUE),
    (2, 2, 'Carlos Mendoza (Jefe)', 'jefe@almacen.com', '$2b$10$09nO0UsvDNtws3Mlv6mC/O4VNDleeoL9fUIjWaFm/5B7z2qZfMMqi', TRUE),
    (3, 3, 'Luis Ramírez (Operario)', 'operario@almacen.com', '$2b$10$DfM4JpBrLUbQavsE.jnpruTf5w.dhsv7pCsccgvnDqUw84WDubqji', TRUE)
ON CONFLICT (email) DO UPDATE SET password_hash = EXCLUDED.password_hash;
SELECT setval('usuarios_id_usuario_seq', COALESCE((SELECT MAX(id_usuario) FROM usuarios), 1));

-- 3. Almacenes
INSERT INTO almacenes (id_almacen, codigo, nombre, direccion, activo) VALUES
    (1, 'ALM-CENTRAL', 'Almacén Central Principal', 'Av. Industrial 500, Sede Central', TRUE),
    (2, 'ALM-SECUNDARIO', 'Depósito Auxiliar Norte', 'Calle Comercio 120, Norte', TRUE)
ON CONFLICT (id_almacen) DO NOTHING;
SELECT setval('almacenes_id_almacen_seq', COALESCE((SELECT MAX(id_almacen) FROM almacenes), 1));

-- 4. Ubicaciones Físicas
INSERT INTO ubicaciones (id_ubicacion, id_almacen, pasillo, estanteria, nivel, casillero, codigo_ubicacion, capacidad_maxima) VALUES
    (1, 1, 'P01', 'E01', 'N01', 'C01', 'ALM-CENTRAL-P01-E01-N01-C01', 1000.00),
    (2, 1, 'P01', 'E01', 'N01', 'C02', 'ALM-CENTRAL-P01-E01-N01-C02', 1000.00),
    (3, 2, 'P02', 'E01', 'N01', 'C01', 'ALM-SECUNDARIO-P02-E01-N01-C01', 1000.00)
ON CONFLICT (codigo_ubicacion) DO NOTHING;
SELECT setval('ubicaciones_id_ubicacion_seq', COALESCE((SELECT MAX(id_ubicacion) FROM ubicaciones), 1));

-- 5. Tipos de Movimiento
INSERT INTO tipos_movimiento (id_tipo, nombre, factor, descripcion) VALUES
    (1, 'ENTRADA_COMPRA', 1, 'Ingreso de mercadería por compra a proveedor'),
    (2, 'SALIDA_VENTA', -1, 'Despacho de mercadería por venta'),
    (3, 'TRANSFERENCIA_INTERNA', 0, 'Reubicación de mercadería entre casilleros o almacenes'),
    (4, 'AJUSTE_POSITIVO', 1, 'Ingreso por sobrante en reconteo de inventario'),
    (5, 'AJUSTE_NEGATIVO', -1, 'Salida por merma, rotura o caducidad')
ON CONFLICT (id_tipo) DO UPDATE SET factor = EXCLUDED.factor;
SELECT setval('tipos_movimiento_id_tipo_seq', COALESCE((SELECT MAX(id_tipo) FROM tipos_movimiento), 1));

-- 6. Productos
INSERT INTO productos (id_producto, codigo_barras, nombre, descripcion, precio_costo, precio_venta, stock_actual, stock_minimo) VALUES
    (1, '75010001001', 'Amoxicilina 500mg (Caja 30 cápsulas)', 'Antibiótico de amplio espectro', 5.50, 12.00, 80, 20),
    (2, '75010001002', 'Paracetamol 500mg (Caja 100 tabletas)', 'Analgésico y antipirético oral', 3.20, 8.50, 150, 30),
    (3, '75010001003', 'Ibuprofeno 400mg (Caja 50 cápsulas)', 'Antiinflamatorio no esteroideo', 4.10, 9.80, 50, 15)
ON CONFLICT (codigo_barras) DO NOTHING;
SELECT setval('productos_id_producto_seq', COALESCE((SELECT MAX(id_producto) FROM productos), 1));

-- 7. Lotes de prueba con rotación FEFO
INSERT INTO lotes (id_lote, id_producto, numero_lote, fecha_vencimiento) VALUES
    (1, 1, 'AMX-2026-A', '2026-11-15'),
    (2, 1, 'AMX-2027-B', '2027-05-20'),
    (3, 2, 'PAR-2026-X', '2026-12-31')
ON CONFLICT (id_producto, numero_lote) DO NOTHING;
SELECT setval('lotes_id_lote_seq', COALESCE((SELECT MAX(id_lote) FROM lotes), 1));

-- 8. Stock granular en inventario_ubicaciones
INSERT INTO inventario_ubicaciones (id_ubicacion, id_producto, id_lote, cantidad) VALUES
    (1, 1, 1, 30),
    (2, 1, 2, 50),
    (1, 2, 3, 150)
ON CONFLICT (id_ubicacion, id_producto, id_lote) DO NOTHING;
