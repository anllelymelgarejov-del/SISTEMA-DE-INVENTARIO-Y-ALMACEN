const express = require('express');
const router = express.Router();
const ExcelJS = require('exceljs');
const pool = require('../config/db');

/**
 * @route   GET /api/reportes/excel
 * @desc    Genera y descarga un archivo Excel (.xlsx) con el reporte consolidado
 *          de inventario de productos y su valorización total (stock_actual * precio_unitario)
 * @access  Público
 */
router.get('/excel', async (req, res) => {
  try {
    const query = `
      SELECT 
        id_producto,
        codigo_barras,
        nombre,
        descripcion,
        precio_unitario,
        stock_actual,
        stock_minimo,
        (stock_actual * precio_unitario) AS valor_total,
        CASE 
          WHEN stock_actual <= stock_minimo THEN 'BAJO STOCK'
          ELSE 'NORMAL'
        END AS estado_stock
      FROM productos
      ORDER BY id_producto ASC;
    `;

    const resultado = await pool.query(query);
    const productos = resultado.rows;

    // Crear un nuevo libro de trabajo Excel
    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'Sistema de Control de Inventario';
    workbook.created = new Date();

    const worksheet = workbook.addWorksheet('Inventario Consolidado', {
      views: [{ showGridLines: true }],
    });

    // 1. Título principal del reporte
    worksheet.mergeCells('A1:H1');
    const titleCell = worksheet.getCell('A1');
    titleCell.value = 'REPORTE CONSOLIDADO DE INVENTARIO Y VALORIZACIÓN';
    titleCell.font = { name: 'Calibri', size: 16, bold: true, color: { argb: 'FFFFFFFF' } };
    titleCell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF312E81' }, // Indigo oscuro
    };
    titleCell.alignment = { vertical: 'middle', horizontal: 'center' };
    worksheet.getRow(1).height = 35;

    // 2. Metadatos de generación
    worksheet.mergeCells('A2:H2');
    const subtitleCell = worksheet.getCell('A2');
    const fechaHora = new Date().toLocaleString('es-MX', { timeZone: 'America/Mexico_City' });
    subtitleCell.value = `Generado el: ${fechaHora} | Total de ítems: ${productos.length}`;
    subtitleCell.font = { italic: true, size: 10, color: { argb: 'FF475569' } };
    subtitleCell.alignment = { vertical: 'middle', horizontal: 'center' };
    worksheet.getRow(2).height = 20;

    // Espacio en blanco
    worksheet.getRow(3).height = 10;

    // 3. Encabezados de columnas
    const headers = [
      { header: 'ID', key: 'id_producto', width: 8 },
      { header: 'Código de Barras', key: 'codigo_barras', width: 20 },
      { header: 'Nombre del Producto', key: 'nombre', width: 32 },
      { header: 'Descripción', key: 'descripcion', width: 35 },
      { header: 'Precio Unitario ($)', key: 'precio_unitario', width: 18 },
      { header: 'Stock Actual', key: 'stock_actual', width: 14 },
      { header: 'Stock Mínimo', key: 'stock_minimo', width: 14 },
      { header: 'Estado', key: 'estado_stock', width: 14 },
      { header: 'Valorización Total ($)', key: 'valor_total', width: 22 },
    ];

    worksheet.columns = headers;

    const headerRow = worksheet.getRow(4);
    headerRow.values = headers.map(h => h.header);
    headerRow.height = 26;

    headerRow.eachCell((cell) => {
      cell.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 11 };
      cell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FF4F46E5' }, // Indigo brand
      };
      cell.alignment = { vertical: 'middle', horizontal: 'center' };
      cell.border = {
        top: { style: 'thin', color: { argb: 'FFE2E8F0' } },
        left: { style: 'thin', color: { argb: 'FFE2E8F0' } },
        bottom: { style: 'medium', color: { argb: 'FF1E1B4B' } },
        right: { style: 'thin', color: { argb: 'FFE2E8F0' } },
      };
    });

    // 4. Agregar filas de datos
    let totalUnidades = 0;
    let totalValorizacion = 0;

    productos.forEach((prod, index) => {
      const precioNum = parseFloat(prod.precio_unitario) || 0;
      const stockNum = parseInt(prod.stock_actual, 10) || 0;
      const valorTotalNum = parseFloat(prod.valor_total) || (stockNum * precioNum);

      totalUnidades += stockNum;
      totalValorizacion += valorTotalNum;

      const row = worksheet.addRow({
        id_producto: prod.id_producto,
        codigo_barras: prod.codigo_barras,
        nombre: prod.nombre,
        descripcion: prod.descripcion || 'Sin descripción',
        precio_unitario: precioNum,
        stock_actual: stockNum,
        stock_minimo: parseInt(prod.stock_minimo, 10) || 0,
        estado_stock: prod.estado_stock,
        valor_total: valorTotalNum,
      });

      row.height = 22;

      // Alineaciones y formatos
      row.getCell('id_producto').alignment = { horizontal: 'center', vertical: 'middle' };
      row.getCell('codigo_barras').alignment = { horizontal: 'center', vertical: 'middle' };
      row.getCell('nombre').alignment = { horizontal: 'left', vertical: 'middle' };
      row.getCell('descripcion').alignment = { horizontal: 'left', vertical: 'middle' };
      row.getCell('precio_unitario').alignment = { horizontal: 'right', vertical: 'middle' };
      row.getCell('precio_unitario').numFmt = '"$"#,##0.00';
      row.getCell('stock_actual').alignment = { horizontal: 'center', vertical: 'middle' };
      row.getCell('stock_actual').numFmt = '#,##0';
      row.getCell('stock_minimo').alignment = { horizontal: 'center', vertical: 'middle' };
      row.getCell('stock_minimo').numFmt = '#,##0';
      row.getCell('estado_stock').alignment = { horizontal: 'center', vertical: 'middle' };
      row.getCell('valor_total').alignment = { horizontal: 'right', vertical: 'middle' };
      row.getCell('valor_total').numFmt = '"$"#,##0.00';

      // Resaltar alerta de stock bajo
      if (prod.estado_stock === 'BAJO STOCK') {
        row.getCell('estado_stock').fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: 'FFFFE4E6' }, // Rose suave
        };
        row.getCell('estado_stock').font = { bold: true, color: { argb: 'FFE11D48' } };
      } else {
        row.getCell('estado_stock').font = { bold: true, color: { argb: 'FF059669' } };
      }

      // Bordes tenues
      row.eachCell((cell) => {
        cell.border = {
          bottom: { style: 'thin', color: { argb: 'FFF1F5F9' } },
          left: { style: 'thin', color: { argb: 'FFF1F5F9' } },
          right: { style: 'thin', color: { argb: 'FFF1F5F9' } },
        };
      });
    });

    // 5. Fila de Totales Generales
    const summaryRow = worksheet.addRow({
      id_producto: '',
      codigo_barras: '',
      nombre: 'TOTALES CONSOLIDADOS',
      descripcion: '',
      precio_unitario: '',
      stock_actual: totalUnidades,
      stock_minimo: '',
      estado_stock: '',
      valor_total: totalValorizacion,
    });

    summaryRow.height = 26;
    summaryRow.eachCell((cell) => {
      cell.font = { bold: true, size: 11, color: { argb: 'FF0F172A' } };
      cell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFF1F5F9' },
      };
      cell.border = {
        top: { style: 'medium', color: { argb: 'FF334155' } },
        bottom: { style: 'double', color: { argb: 'FF334155' } },
      };
    });

    summaryRow.getCell('stock_actual').alignment = { horizontal: 'center', vertical: 'middle' };
    summaryRow.getCell('stock_actual').numFmt = '#,##0';
    summaryRow.getCell('valor_total').alignment = { horizontal: 'right', vertical: 'middle' };
    summaryRow.getCell('valor_total').numFmt = '"$"#,##0.00';

    // 6. Configurar cabeceras de respuesta HTTP para forzar descarga
    const fechaArchivo = new Date().toISOString().split('T')[0];
    const nombreArchivo = `Reporte_Inventario_Valorizado_${fechaArchivo}.xlsx`;

    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    );
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${nombreArchivo}"`
    );

    // Escribir el libro directamente en el flujo de respuesta
    await workbook.xlsx.write(res);
    res.end();
  } catch (error) {
    console.error('Error al generar reporte Excel de inventario:', error);
    if (!res.headersSent) {
      res.status(500).json({
        success: false,
        mensaje: 'Error interno del servidor al exportar el reporte a Excel',
        error: error.message,
      });
    }
  }
});

/**
 * @route   GET /api/reportes/historial/excel
 * @desc    Genera y descarga un archivo Excel (.xlsx) con el historial detallado de movimientos
 * @access  Público
 * @query   fecha_inicio, fecha_fin, id_producto, id_tipo
 */
router.get('/historial/excel', async (req, res) => {
  const { fecha_inicio, fecha_fin, id_producto, id_tipo } = req.query;

  try {
    const condiciones = [];
    const valores = [];
    let paramIndex = 1;

    if (fecha_inicio) {
      condiciones.push(`m.fecha_movimiento >= $${paramIndex}`);
      valores.push(`${fecha_inicio} 00:00:00`);
      paramIndex++;
    }

    if (fecha_fin) {
      condiciones.push(`m.fecha_movimiento <= $${paramIndex}`);
      valores.push(`${fecha_fin} 23:59:59.999`);
      paramIndex++;
    }

    if (id_producto) {
      condiciones.push(`m.id_producto = $${paramIndex}`);
      valores.push(parseInt(id_producto, 10));
      paramIndex++;
    }

    if (id_tipo) {
      condiciones.push(`m.id_tipo = $${paramIndex}`);
      valores.push(parseInt(id_tipo, 10));
      paramIndex++;
    }

    const whereClause = condiciones.length > 0 ? `WHERE ${condiciones.join(' AND ')}` : '';

    const query = `
      SELECT 
        m.id_movimiento,
        m.fecha_movimiento,
        m.cantidad,
        m.observacion,
        p.codigo_barras,
        p.nombre AS producto_nombre,
        t.nombre AS tipo_nombre,
        t.factor,
        (m.cantidad * t.factor) AS impacto_stock
      FROM movimientos m
      INNER JOIN productos p ON m.id_producto = p.id_producto
      INNER JOIN tipos_movimiento t ON m.id_tipo = t.id_tipo
      ${whereClause}
      ORDER BY m.fecha_movimiento DESC, m.id_movimiento DESC;
    `;

    const resultado = await pool.query(query, valores);
    const movimientos = resultado.rows;

    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'Sistema de Control de Inventario';
    workbook.created = new Date();

    const worksheet = workbook.addWorksheet('Historial de Kardex', {
      views: [{ showGridLines: true }],
    });

    // Título
    worksheet.mergeCells('A1:G1');
    const titleCell = worksheet.getCell('A1');
    titleCell.value = 'HISTORIAL DE MOVIMIENTOS DE ALMACÉN (KARDEX)';
    titleCell.font = { name: 'Calibri', size: 16, bold: true, color: { argb: 'FFFFFFFF' } };
    titleCell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF1E293B' },
    };
    titleCell.alignment = { vertical: 'middle', horizontal: 'center' };
    worksheet.getRow(1).height = 35;

    // Encabezados
    const headers = [
      { header: '# Mov', key: 'id_movimiento', width: 10 },
      { header: 'Fecha y Hora', key: 'fecha_movimiento', width: 22 },
      { header: 'Código', key: 'codigo_barras', width: 18 },
      { header: 'Producto', key: 'producto_nombre', width: 30 },
      { header: 'Tipo Movimiento', key: 'tipo_nombre', width: 22 },
      { header: 'Impacto Stock', key: 'impacto_stock', width: 16 },
      { header: 'Observación', key: 'observacion', width: 35 },
    ];

    worksheet.columns = headers;
    const headerRow = worksheet.getRow(3);
    headerRow.values = headers.map(h => h.header);
    headerRow.height = 24;

    headerRow.eachCell((cell) => {
      cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
      cell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FF475569' },
      };
      cell.alignment = { vertical: 'middle', horizontal: 'center' };
    });

    movimientos.forEach((mov) => {
      const fechaStr = new Date(mov.fecha_movimiento).toLocaleString('es-MX');
      const row = worksheet.addRow({
        id_movimiento: mov.id_movimiento,
        fecha_movimiento: fechaStr,
        codigo_barras: mov.codigo_barras,
        producto_nombre: mov.producto_nombre,
        tipo_nombre: mov.tipo_nombre,
        impacto_stock: mov.impacto_stock > 0 ? `+${mov.impacto_stock}` : `${mov.impacto_stock}`,
        observacion: mov.observacion || '-',
      });

      row.height = 20;
      row.getCell('id_movimiento').alignment = { horizontal: 'center' };
      row.getCell('fecha_movimiento').alignment = { horizontal: 'center' };
      row.getCell('codigo_barras').alignment = { horizontal: 'center' };
      row.getCell('impacto_stock').alignment = { horizontal: 'center' };
      row.getCell('impacto_stock').font = {
        bold: true,
        color: { argb: mov.impacto_stock > 0 ? 'FF059669' : 'FFE11D48' },
      };
    });

    const fechaArchivo = new Date().toISOString().split('T')[0];
    const nombreArchivo = `Reporte_Historial_Kardex_${fechaArchivo}.xlsx`;

    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    );
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${nombreArchivo}"`
    );

    await workbook.xlsx.write(res);
    res.end();
  } catch (error) {
    console.error('Error al generar reporte Excel de historial:', error);
    if (!res.headersSent) {
      res.status(500).json({
        success: false,
        mensaje: 'Error interno del servidor al exportar historial a Excel',
        error: error.message,
      });
    }
  }
});

module.exports = router;
