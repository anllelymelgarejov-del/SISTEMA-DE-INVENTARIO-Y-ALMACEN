-- Datos de demostración para SGI Almacén Pro.
-- Seguro para ejecuciones repetidas: no elimina ni sobrescribe registros existentes.
-- Ejecutar después de database/script_definitivo.sql.

BEGIN;

INSERT INTO almacenes (codigo, nombre, ubicacion) VALUES
  ('ALM-1', 'Almacén Central', 'Sede Principal'),
  ('ALM-NOR', 'Almacén Norte', 'Av. Los Olivos 125, Lima Norte'),
  ('ALM-SUR', 'Almacén Sur', 'Av. Pachacútec 840, Lima Sur')
ON CONFLICT DO NOTHING;

INSERT INTO productos (codigo_barras, nombre, categoria, descripcion, precio) VALUES
  ('DEMO-750100000001', 'Paracetamol 500 mg', 'Medicamentos', 'Tabletas, caja x 100 unidades', 18.50),
  ('DEMO-750100000002', 'Ibuprofeno 400 mg', 'Medicamentos', 'Tabletas, caja x 50 unidades', 24.90),
  ('DEMO-750100000003', 'Amoxicilina 500 mg', 'Medicamentos', 'Cápsulas, caja x 100 unidades', 42.00),
  ('DEMO-750100000004', 'Loratadina 10 mg', 'Medicamentos', 'Tabletas, caja x 100 unidades', 21.50),
  ('DEMO-750100000005', 'Omeprazol 20 mg', 'Medicamentos', 'Cápsulas, caja x 100 unidades', 36.00),
  ('DEMO-750100000006', 'Vitamina C 500 mg', 'Suplementos', 'Tabletas, frasco x 100 unidades', 29.90),
  ('DEMO-750100000007', 'Guantes de nitrilo M', 'Insumos médicos', 'Caja x 100 unidades', 32.00),
  ('DEMO-750100000008', 'Alcohol medicinal 70%', 'Insumos médicos', 'Frasco de 1 litro', 12.80)
ON CONFLICT DO NOTHING;

-- Las fechas relativas conservan los estados de alerta al ejecutar el seed en cualquier día.
WITH lotes_demo(codigo_barras, numero_lote, dias_vencimiento) AS (
  VALUES
    ('DEMO-750100000001', 'DEMO-PCT-2601-A', 20),
    ('DEMO-750100000001', 'DEMO-PCT-2601-B', 365),
    ('DEMO-750100000002', 'DEMO-IBU-2601-A', 12),
    ('DEMO-750100000002', 'DEMO-IBU-2601-B', 240),
    ('DEMO-750100000003', 'DEMO-AMX-2601-A', 28),
    ('DEMO-750100000003', 'DEMO-AMX-2601-B', 400),
    ('DEMO-750100000004', 'DEMO-LOR-2601-V', -7),
    ('DEMO-750100000004', 'DEMO-LOR-2601-A', 180),
    ('DEMO-750100000005', 'DEMO-OME-2601-A', 90),
    ('DEMO-750100000005', 'DEMO-OME-2601-B', 330),
    ('DEMO-750100000006', 'DEMO-VTC-2601-A', 300),
    ('DEMO-750100000006', 'DEMO-VTC-2601-B', 500),
    ('DEMO-750100000007', 'DEMO-GNT-2601-A', 730),
    ('DEMO-750100000007', 'DEMO-GNT-2601-B', 900),
    ('DEMO-750100000008', 'DEMO-ALC-2601-A', 150),
    ('DEMO-750100000008', 'DEMO-ALC-2601-B', 300)
)
INSERT INTO lotes (id_producto, numero_lote, fecha_vencimiento)
SELECT p.id_producto, d.numero_lote, CURRENT_DATE + d.dias_vencimiento
FROM lotes_demo d
INNER JOIN productos p ON p.codigo_barras = d.codigo_barras
ON CONFLICT DO NOTHING;

-- Stock repartido entre las tres sedes. Los lotes vencidos se conservan para probar alertas.
WITH stock_demo(codigo_almacen, codigo_barras, numero_lote, cantidad) AS (
  VALUES
    ('ALM-1', 'DEMO-750100000001', 'DEMO-PCT-2601-A', 120),
    ('ALM-1', 'DEMO-750100000001', 'DEMO-PCT-2601-B', 240),
    ('ALM-NOR', 'DEMO-750100000001', 'DEMO-PCT-2601-A', 45),
    ('ALM-SUR', 'DEMO-750100000001', 'DEMO-PCT-2601-B', 60),
    ('ALM-1', 'DEMO-750100000002', 'DEMO-IBU-2601-A', 90),
    ('ALM-NOR', 'DEMO-750100000002', 'DEMO-IBU-2601-B', 55),
    ('ALM-SUR', 'DEMO-750100000002', 'DEMO-IBU-2601-A', 30),
    ('ALM-1', 'DEMO-750100000003', 'DEMO-AMX-2601-A', 75),
    ('ALM-NOR', 'DEMO-750100000003', 'DEMO-AMX-2601-B', 40),
    ('ALM-SUR', 'DEMO-750100000003', 'DEMO-AMX-2601-A', 25),
    ('ALM-1', 'DEMO-750100000004', 'DEMO-LOR-2601-V', 18),
    ('ALM-NOR', 'DEMO-750100000004', 'DEMO-LOR-2601-A', 36),
    ('ALM-1', 'DEMO-750100000005', 'DEMO-OME-2601-A', 65),
    ('ALM-SUR', 'DEMO-750100000005', 'DEMO-OME-2601-B', 32),
    ('ALM-1', 'DEMO-750100000006', 'DEMO-VTC-2601-A', 50),
    ('ALM-NOR', 'DEMO-750100000006', 'DEMO-VTC-2601-B', 35),
    ('ALM-SUR', 'DEMO-750100000007', 'DEMO-GNT-2601-A', 80),
    ('ALM-1', 'DEMO-750100000008', 'DEMO-ALC-2601-A', 42),
    ('ALM-NOR', 'DEMO-750100000008', 'DEMO-ALC-2601-B', 24)
)
INSERT INTO inventario (id_almacen, id_producto, id_lote, cantidad)
SELECT a.id_almacen, p.id_producto, l.id_lote, s.cantidad
FROM stock_demo s
INNER JOIN almacenes a ON a.codigo = s.codigo_almacen
INNER JOIN productos p ON p.codigo_barras = s.codigo_barras
INNER JOIN lotes l ON l.id_producto = p.id_producto AND l.numero_lote = s.numero_lote
ON CONFLICT (id_almacen, id_producto, id_lote) DO NOTHING;

-- Historial de ejemplo con fechas escalonadas para las gráficas y el Kardex.
WITH movimientos_demo(codigo_almacen, codigo_barras, numero_lote, tipo, cantidad, dias_atras, referencia) AS (
  VALUES
    ('ALM-1', 'DEMO-750100000001', 'DEMO-PCT-2601-A', 'ENTRADA', 120, 6, 'recepcion-central-01'),
    ('ALM-1', 'DEMO-750100000001', 'DEMO-PCT-2601-A', 'SALIDA', 20, 5, 'despacho-central-01'),
    ('ALM-NOR', 'DEMO-750100000001', 'DEMO-PCT-2601-A', 'ENTRADA', 45, 4, 'recepcion-norte-01'),
    ('ALM-1', 'DEMO-750100000002', 'DEMO-IBU-2601-A', 'ENTRADA', 90, 3, 'recepcion-central-02'),
    ('ALM-SUR', 'DEMO-750100000002', 'DEMO-IBU-2601-A', 'ENTRADA', 30, 2, 'recepcion-sur-01'),
    ('ALM-1', 'DEMO-750100000003', 'DEMO-AMX-2601-A', 'ENTRADA', 75, 1, 'recepcion-central-03'),
    ('ALM-1', 'DEMO-750100000004', 'DEMO-LOR-2601-V', 'ENTRADA', 18, 0, 'recepcion-lote-vencido'),
    ('ALM-NOR', 'DEMO-750100000004', 'DEMO-LOR-2601-A', 'SALIDA', 4, 0, 'despacho-norte-01'),
    ('ALM-1', 'DEMO-750100000005', 'DEMO-OME-2601-A', 'ENTRADA', 65, 2, 'recepcion-central-04'),
    ('ALM-SUR', 'DEMO-750100000006', 'DEMO-VTC-2601-A', 'SALIDA', 5, 3, 'despacho-sur-01'),
    ('ALM-SUR', 'DEMO-750100000007', 'DEMO-GNT-2601-A', 'ENTRADA', 80, 8, 'recepcion-sur-02'),
    ('ALM-1', 'DEMO-750100000008', 'DEMO-ALC-2601-A', 'SALIDA', 3, 1, 'despacho-central-02')
)
INSERT INTO movimientos (id_almacen, id_producto, id_lote, id_usuario, tipo, cantidad, fecha, observacion)
SELECT a.id_almacen, p.id_producto, l.id_lote, u.id_usuario, d.tipo, d.cantidad,
       CURRENT_TIMESTAMP - (d.dias_atras || ' days')::interval,
       'DEMO_SEED|' || d.referencia
FROM movimientos_demo d
INNER JOIN almacenes a ON a.codigo = d.codigo_almacen
INNER JOIN productos p ON p.codigo_barras = d.codigo_barras
INNER JOIN lotes l ON l.id_producto = p.id_producto AND l.numero_lote = d.numero_lote
LEFT JOIN usuarios u ON u.email = 'admin@almacen.com'
WHERE NOT EXISTS (
  SELECT 1 FROM movimientos m WHERE m.observacion = 'DEMO_SEED|' || d.referencia
);

COMMIT;
