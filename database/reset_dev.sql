-- SOLO PARA DESARROLLO: elimina completamente el esquema WMS y sus datos.
-- No ejecutar en una base con información que se quiera conservar.

DROP TABLE IF EXISTS detalle_transferencias CASCADE;
DROP TABLE IF EXISTS transferencias CASCADE;
DROP TABLE IF EXISTS movimientos CASCADE;
DROP TABLE IF EXISTS inventario CASCADE;
DROP TABLE IF EXISTS lotes CASCADE;
DROP TABLE IF EXISTS productos CASCADE;
DROP TABLE IF EXISTS almacenes CASCADE;
DROP TABLE IF EXISTS usuarios CASCADE;
DROP TABLE IF EXISTS roles CASCADE;
