-- ==============================================================================
-- VALIDACIONES CRÍTICAS DE NEGOCIO EN POSTGRESQL (CONSTRAINTS Y TRIGGERS)
-- Base de Datos: sis_inv_almacen / inventario_db
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1. CHECK DE STOCK NO NEGATIVO
-- Asegura que la columna 'cantidad' en 'inventario_ubicaciones' jamás sea menor a 0.
-- ------------------------------------------------------------------------------
DO $$
BEGIN
    -- Eliminar constraints previas anónimas o con nombres anteriores si existen
    IF EXISTS (
        SELECT 1 FROM pg_constraint 
        WHERE conname = 'chk_stock_no_negativo' AND conrelid = 'inventario_ubicaciones'::regclass
    ) THEN
        ALTER TABLE inventario_ubicaciones DROP CONSTRAINT chk_stock_no_negativo;
    END IF;

    -- Agregar constraint explícita nombrada
    ALTER TABLE inventario_ubicaciones 
    ADD CONSTRAINT chk_stock_no_negativo 
    CHECK (cantidad >= 0);
END $$;

-- ------------------------------------------------------------------------------
-- 2. VALIDACIÓN DE MISMA UBICACIÓN EN TRANSFERENCIAS
-- Restricción que impida traslados donde la ubicación origen sea igual a la destino.
-- ------------------------------------------------------------------------------

-- En tabla 'detalle_transferencias':
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM pg_constraint 
        WHERE conname = 'chk_transferencia_distinta_ubicacion' AND conrelid = 'detalle_transferencias'::regclass
    ) THEN
        ALTER TABLE detalle_transferencias DROP CONSTRAINT chk_transferencia_distinta_ubicacion;
    END IF;

    ALTER TABLE detalle_transferencias 
    ADD CONSTRAINT chk_transferencia_distinta_ubicacion 
    CHECK (id_ubicacion_origen != id_ubicacion_destino);
END $$;

-- En tabla 'movimientos' (cuando se registran origen y destino simultáneamente):
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM pg_constraint 
        WHERE conname = 'chk_movimiento_distinta_ubicacion' AND conrelid = 'movimientos'::regclass
    ) THEN
        ALTER TABLE movimientos DROP CONSTRAINT chk_movimiento_distinta_ubicacion;
    END IF;

    ALTER TABLE movimientos 
    ADD CONSTRAINT chk_movimiento_distinta_ubicacion 
    CHECK (
        id_ubicacion_origen IS NULL 
        OR id_ubicacion_destino IS NULL 
        OR id_ubicacion_origen != id_ubicacion_destino
    );
END $$;

-- ------------------------------------------------------------------------------
-- 3. BLOQUEO DE LOTES VENCIDOS (TRIGGER EN MOVIMIENTOS)
-- Como PostgreSQL no permite funciones dinámicas como CURRENT_DATE en un CHECK
-- constraint estándar, se implementa mediante una función y Trigger PL/pgSQL
-- antes de registrar cualquier salida o despacho de inventario.
-- ------------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION fn_bloquear_salida_lote_vencido()
RETURNS TRIGGER AS $$
DECLARE
    v_fecha_vencimiento DATE;
    v_numero_lote VARCHAR(100);
    v_factor INT;
    v_nombre_tipo VARCHAR(50);
BEGIN
    -- Solo aplica si el movimiento referencia a un lote específico
    IF NEW.id_lote IS NOT NULL THEN
        -- Obtener el factor multiplicador del tipo de movimiento
        SELECT t.factor, t.nombre 
        INTO v_factor, v_nombre_tipo
        FROM tipos_movimiento t
        WHERE t.id_tipo = NEW.id_tipo;

        -- Si el tipo de movimiento es una salida (factor < 0 ej: SALIDA_VENTA, AJUSTE_NEGATIVO)
        IF v_factor < 0 OR v_nombre_tipo ILIKE '%SALIDA%' OR v_nombre_tipo ILIKE '%DESPACHO%' THEN
            SELECT l.fecha_vencimiento, l.numero_lote
            INTO v_fecha_vencimiento, v_numero_lote
            FROM lotes l
            WHERE l.id_lote = NEW.id_lote;

            -- Si el lote está vencido respecto a la fecha actual del sistema
            IF v_fecha_vencimiento IS NOT NULL AND v_fecha_vencimiento < CURRENT_DATE THEN
                RAISE EXCEPTION 'El lote [%] se encuentra vencido desde el %. No está permitido registrar salidas o despachos de lotes expirados.',
                    v_numero_lote, v_fecha_vencimiento
                    USING ERRCODE = '23514'; -- Error SQL check_violation
            END IF;
        END IF;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Asociar el trigger a la tabla de movimientos
DROP TRIGGER IF EXISTS trg_bloquear_salida_lote_vencido ON movimientos;
CREATE TRIGGER trg_bloquear_salida_lote_vencido
BEFORE INSERT OR UPDATE ON movimientos
FOR EACH ROW
EXECUTE FUNCTION fn_bloquear_salida_lote_vencido();
