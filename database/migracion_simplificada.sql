-- ==============================================================================
-- MIGRACIÓN SIMPLIFICADA DEL SISTEMA DE INVENTARIOS
-- Elimina la dependencia de 'ubicaciones' y centraliza el stock en 'inventario'
-- ==============================================================================

-- 1. TABLA SIMPLIFICADA DE INVENTARIO (Stock directo por Almacén, Producto y Lote)
CREATE TABLE IF NOT EXISTS inventario (
    id_inventario SERIAL PRIMARY KEY,
    id_almacen INT NOT NULL REFERENCES almacenes(id_almacen) ON DELETE CASCADE,
    id_producto INT NOT NULL REFERENCES productos(id_producto) ON DELETE CASCADE,
    id_lote INT NOT NULL REFERENCES lotes(id_lote) ON DELETE CASCADE,
    cantidad INT NOT NULL DEFAULT 0 CHECK (cantidad >= 0),
    actualizado_en TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_inventario_almacen_lote UNIQUE (id_almacen, id_producto, id_lote)
);

-- 2. MIGRAR STOCK EXISTENTE DESDE 'inventario_ubicaciones' SI EXISTE
DO $$
BEGIN
    IF EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' AND table_name = 'inventario_ubicaciones'
    ) THEN
        INSERT INTO inventario (id_almacen, id_producto, id_lote, cantidad)
        SELECT 
            COALESCE(u.id_almacen, 1) AS id_almacen,
            iu.id_producto,
            iu.id_lote,
            SUM(iu.cantidad) AS cantidad
        FROM inventario_ubicaciones iu
        LEFT JOIN ubicaciones u ON iu.id_ubicacion = u.id_ubicacion
        WHERE iu.cantidad > 0
        GROUP BY COALESCE(u.id_almacen, 1), iu.id_producto, iu.id_lote
        ON CONFLICT (id_almacen, id_producto, id_lote) 
        DO UPDATE SET cantidad = EXCLUDED.cantidad;
    END IF;
END $$;

-- 3. ADAPTAR TABLA 'movimientos' A LA ESTRUCTURA SIMPLIFICADA
ALTER TABLE movimientos ADD COLUMN IF NOT EXISTS id_almacen INT REFERENCES almacenes(id_almacen);
ALTER TABLE movimientos ADD COLUMN IF NOT EXISTS tipo_movimiento VARCHAR(20) DEFAULT 'ENTRADA';

-- Relajar columnas antiguas de ubicación
DO $$
BEGIN
    IF EXISTS (SELECT FROM information_schema.columns WHERE table_name = 'movimientos' AND column_name = 'id_tipo') THEN
        ALTER TABLE movimientos ALTER COLUMN id_tipo DROP NOT NULL;
    END IF;
    IF EXISTS (SELECT FROM information_schema.columns WHERE table_name = 'movimientos' AND column_name = 'costo_unitario') THEN
        ALTER TABLE movimientos ALTER COLUMN costo_unitario DROP NOT NULL;
        ALTER TABLE movimientos ALTER COLUMN costo_unitario SET DEFAULT 0.00;
    END IF;
    IF EXISTS (SELECT FROM information_schema.columns WHERE table_name = 'movimientos' AND column_name = 'id_ubicacion_origen') THEN
        ALTER TABLE movimientos ALTER COLUMN id_ubicacion_origen DROP NOT NULL;
    END IF;
    IF EXISTS (SELECT FROM information_schema.columns WHERE table_name = 'movimientos' AND column_name = 'id_ubicacion_destino') THEN
        ALTER TABLE movimientos ALTER COLUMN id_ubicacion_destino DROP NOT NULL;
    END IF;
END $$;

-- Actualizar id_almacen en movimientos históricos existentes si era null
UPDATE movimientos SET id_almacen = 1 WHERE id_almacen IS NULL;
