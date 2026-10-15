-- ==============================================================================
-- ⚠️  ARCHIVO OBSOLETO (DEPRECATED) - NO USAR
-- ==============================================================================
-- Este fue el script base del ESQUEMA ANTIGUO y ya NO es compatible con el
-- backend actual. Referenciaba columnas que no existen en el esquema vigente:
--
--   * movimientos.fecha_movimiento   (hoy la columna es "fecha")
--   * productos.precio_unitario      (hoy son "precio_costo" y "precio_venta")
--   * productos.stock_actual / stock_minimo (el stock vive en la tabla "inventario")
--
-- Ejecutarlo producía el error:
--   ERROR: no existe la columna «fecha_movimiento»
--
-- ✅ El esquema correcto y completo (tablas + datos semilla) está en:
--        database/script_definitivo.sql
--
-- Ejecuta:
--        psql -U postgres -d sis_inv_almacen -f database/script_definitivo.sql
-- ==============================================================================

DO $$
BEGIN
    RAISE NOTICE 'database.sql está OBSOLETO. Usa database/script_definitivo.sql para crear el esquema correcto.';
END $$;
