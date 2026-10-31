const express = require('express');
const router = express.Router();
const ExcelJS = require('exceljs');
const pool = require('../config/db');

/**
 * Formatea una fecha a DD/MM/AAAA HH:mm:ss
 */
function formatearFechaHora(fechaInput) {
  if (!fechaInput) return 'N/A';
  const d = new Date(fechaInput);
  if (isNaN(d.getTime())) return String(fechaInput);
  const pad = (n) => String(n).padStart(2, '0');
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

/**
 * @route   GET /api/reportes/excel
 * @desc    Genera y descarga un archivo Excel (.xlsx) con el reporte consolidado
 *          de inventario por almacén, lotes y estado FEFO
 */
router.get('/excel', async (req, res) => {
  try {
    const query = `
      SELECT 
        i.id_inventario,
        a.nombre AS almacen,
        p.id_producto,
        p.codigo_barras,
        p.nombre AS producto,
        COALESCE(p.descripcion, '') AS descripcion,
        l.numero_lote,
        TO_CHAR(l.fecha_vencimiento, 'YYYY-MM-DD') AS fecha_vencimiento,
        (l.fecha_vencimiento - CURRENT_DATE) AS dias_para_vencer,
        i.cantidad
      FROM inventario i
      INNER JOIN almacenes a ON i.id_almacen = a.id_almacen
      INNER JOIN productos p ON i.id_producto = p.id_producto
      INNER JOIN lotes l ON i.id_lote = l.id_lote
      WHERE i.cantidad > 0
      ORDER BY a.id_almacen ASC, l.fecha_vencimiento ASC, p.nombre ASC;
    `;

    const resultado = await pool.query(query);
    const items = resultado.rows;

    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'Sistema WMS Pro';
    workbook.created = new Date();

    const worksheet = workbook.addWorksheet('Inventario por Lotes (FEFO)', {
      views: [{ showGridLines: true }],
    });

    // 1. Título principal
    worksheet.mergeCells('A1:H1');
    const titleCell = worksheet.getCell('A1');
    titleCell.value = 'REPORTE CONSOLIDADO DE INVENTARIO, ALMACENES Y TRAZABILIDAD FEFO';
    titleCell.font = { name: 'Calibri', size: 15, bold: true, color: { argb: 'FFFFFFFF' } };
    titleCell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF0F172A' },
    };
    titleCell.alignment = { vertical: 'middle', horizontal: 'center' };
    worksheet.getRow(1).height = 34;

    // 2. Subtítulo con fecha exacta
    worksheet.mergeCells('A2:H2');
    const subtitleCell = worksheet.getCell('A2');
    subtitleCell.value = `Generado el: ${formatearFechaHora(new Date())} | Total de registros en stock: ${items.length}`;
    subtitleCell.font = { italic: true, size: 10, color: { argb: 'FF475569' } };
    subtitleCell.alignment = { vertical: 'middle', horizontal: 'center' };
    worksheet.getRow(2).height = 20;

    worksheet.getRow(3).height = 10;

    // 3. Encabezados
    const headers = [
      { header: 'Sede / Almacén', key: 'almacen', width: 22 },
      { header: 'Código de Barras', key: 'codigo_barras', width: 20 },
      { header: 'Producto', key: 'producto', width: 32 },
      { header: 'Descripción', key: 'descripcion', width: 32 },
      { header: 'Número de Lote', key: 'numero_lote', width: 18 },
      { header: 'Fecha Vencimiento', key: 'fecha_vencimiento', width: 18 },
      { header: 'Estado FEFO', key: 'estado_fefo', width: 18 },
      { header: 'Stock Disponible', key: 'cantidad', width: 18 },
    ];

    worksheet.columns = headers;

    const headerRow = worksheet.getRow(4);
    headerRow.values = headers.map((h) => h.header);
    headerRow.height = 26;

    headerRow.eachCell((cell) => {
      cell.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 11 };
      cell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FF1D4ED8' },
      };
      cell.alignment = { vertical: 'middle', horizontal: 'center' };
    });

    // 4. Filas
    let totalUnidades = 0;

    items.forEach((item) => {
      const cant = parseInt(item.cantidad, 10) || 0;
      const dias = parseInt(item.dias_para_vencer, 10);
      totalUnidades += cant;

      let estadoFefo = 'ÓPTIMO';
      if (!isNaN(dias)) {
        if (dias < 0) estadoFefo = 'VENCIDO';
        else if (dias <= 30) estadoFefo = `CRÍTICO (${dias}d)`;
        else if (dias <= 90) estadoFefo = `PRÓXIMO (${dias}d)`;
      }

      const row = worksheet.addRow({
        almacen: item.almacen,
        codigo_barras: item.codigo_barras,
        producto: item.producto,
        descripcion: item.descripcion || 'Sin descripción',
        numero_lote: item.numero_lote,
        fecha_vencimiento: item.fecha_vencimiento || 'N/A',
        estado_fefo: estadoFefo,
        cantidad: cant,
      });

      row.height = 22;
      row.getCell('codigo_barras').alignment = { horizontal: 'center', vertical: 'middle' };
      row.getCell('numero_lote').alignment = { horizontal: 'center', vertical: 'middle' };
      row.getCell('fecha_vencimiento').alignment = { horizontal: 'center', vertical: 'middle' };
      row.getCell('estado_fefo').alignment = { horizontal: 'center', vertical: 'middle' };
      row.getCell('cantidad').alignment = { horizontal: 'right', vertical: 'middle' };
      row.getCell('cantidad').numFmt = '#,##0';
    });

    // 5. Fila de totales
    const summaryRow = worksheet.addRow({
      almacen: 'TOTAL CONSOLIDADO',
      codigo_barras: '',
      producto: '',
      descripcion: '',
      numero_lote: '',
      fecha_vencimiento: '',
      estado_fefo: '',
      cantidad: totalUnidades,
    });
    summaryRow.height = 26;
    summaryRow.eachCell((cell) => {
      cell.font = { bold: true, size: 11, color: { argb: 'FF0F172A' } };
      cell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFE2E8F0' },
      };
    });

    const fechaArchivo = new Date().toISOString().split('T')[0];
    const nombreArchivo = `Reporte_Inventario_WMS_${fechaArchivo}.xlsx`;

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
 * @desc    Genera y descarga un archivo Excel (.xlsx) con el historial auditado de movimientos (Kardex)
 */
router.get('/historial/excel', async (req, res) => {
  try {
    const query = `
      SELECT 
        m.id_movimiento,
        m.fecha,
        m.tipo,
        m.cantidad,
        COALESCE(m.observacion, '') AS observacion,
        a.nombre AS almacen,
        p.codigo_barras,
        p.nombre AS producto,
        l.numero_lote,
        COALESCE(u.nombre, 'Sistema') AS usuario,
        CASE 
          WHEN u.id_rol = 1 THEN 'Administrador'
          WHEN u.id_rol = 2 THEN 'Operario'
          ELSE COALESCE(r.nombre, 'Administrador')
        END AS rol_usuario
      FROM movimientos m
      LEFT JOIN almacenes a ON m.id_almacen = a.id_almacen
      LEFT JOIN productos p ON m.id_producto = p.id_producto
      LEFT JOIN lotes l ON m.id_lote = l.id_lote
      LEFT JOIN usuarios u ON m.id_usuario = u.id_usuario
      LEFT JOIN roles r ON u.id_rol = r.id_rol
      ORDER BY m.fecha DESC, m.id_movimiento DESC;
    `;

    const resultado = await pool.query(query);
    const movimientos = resultado.rows;

    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'Sistema WMS Pro';
    workbook.created = new Date();

    const worksheet = workbook.addWorksheet('Auditoría de Movimientos', {
      views: [{ showGridLines: true }],
    });

    worksheet.mergeCells('A1:H1');
    const titleCell = worksheet.getCell('A1');
    titleCell.value = 'HISTORIAL AUDITADO DE MOVIMIENTOS Y TRAZABILIDAD (KARDEX WMS)';
    titleCell.font = { name: 'Calibri', size: 15, bold: true, color: { argb: 'FFFFFFFF' } };
    titleCell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF0F172A' },
    };
    titleCell.alignment = { vertical: 'middle', horizontal: 'center' };
    worksheet.getRow(1).height = 34;

    const headers = [
      { header: '# Mov', key: 'id_movimiento', width: 10 },
      { header: 'Fecha y Hora (DD/MM/AAAA HH:mm:ss)', key: 'fecha_fmt', width: 25 },
      { header: 'Tipo Acción', key: 'tipo', width: 16 },
      { header: 'Producto', key: 'producto', width: 30 },
      { header: 'Lote', key: 'numero_lote', width: 18 },
      { header: 'Almacén', key: 'almacen', width: 22 },
      { header: 'Cantidad', key: 'cantidad_fmt', width: 15 },
      { header: 'Usuario Responsable (Rol)', key: 'usuario_rol', width: 28 },
      { header: 'Proveedor / Observación de Auditoría', key: 'observacion', width: 38 },
    ];

    worksheet.columns = headers;
    const headerRow = worksheet.getRow(3);
    headerRow.values = headers.map((h) => h.header);
    headerRow.height = 25;

    headerRow.eachCell((cell) => {
      cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
      cell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FF1E293B' },
      };
      cell.alignment = { vertical: 'middle', horizontal: 'center' };
    });

    movimientos.forEach((mov) => {
      const esEntrada = String(mov.tipo).toUpperCase() === 'ENTRADA';
      const row = worksheet.addRow({
        id_movimiento: mov.id_movimiento,
        fecha_fmt: formatearFechaHora(mov.fecha),
        tipo: mov.tipo,
        producto: mov.producto || 'N/A',
        numero_lote: mov.numero_lote || 'N/A',
        almacen: mov.almacen || 'N/A',
        cantidad_fmt: `${esEntrada ? '+' : '-'}${mov.cantidad} uds`,
        usuario_rol: `${mov.usuario} (${mov.rol_usuario})`,
        observacion: mov.observacion || '-',
      });

      row.height = 21;
      row.getCell('id_movimiento').alignment = { horizontal: 'center' };
      row.getCell('fecha_fmt').alignment = { horizontal: 'center' };
      row.getCell('tipo').alignment = { horizontal: 'center' };
      row.getCell('numero_lote').alignment = { horizontal: 'center' };
      row.getCell('cantidad_fmt').alignment = { horizontal: 'right' };
      row.getCell('cantidad_fmt').font = {
        bold: true,
        color: { argb: esEntrada ? 'FF059669' : 'FFE11D48' },
      };
    });

    const fechaArchivo = new Date().toISOString().split('T')[0];
    const nombreArchivo = `Reporte_Auditoria_Kardex_${fechaArchivo}.xlsx`;

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
