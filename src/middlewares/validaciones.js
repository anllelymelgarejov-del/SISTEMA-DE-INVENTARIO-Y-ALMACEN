const pool = require('../config/db');

/**
 * ============================================================================
 * HELPER DE RESPUESTAS DE ERROR ESTANDARIZADAS
 * ============================================================================
 * Garantiza un formato JSON homogéneo y descriptivo para el frontend:
 * {
 *   "exito": false,
 *   "codigo": "ERROR_VALIDACION_STOCK",
 *   "mensaje": "Descripción clara del problema",
 *   "detalles": { ... } // Opcional con datos contextuales
 * }
 */
const respuestaError = (res, statusCode, codigo, mensaje, detalles = null) => {
  const respuesta = {
    exito: false,
    success: false,
    codigo,
    mensaje,
  };

  if (detalles) {
    respuesta.detalles = detalles;
  }

  return res.status(statusCode).json(respuesta);
};

/**
 * ============================================================================
 * 1. MIDDLEWARE: VALIDAR STOCK DISPONIBLE (validarStockDisponible)
 * ============================================================================
 * Valida la existencia de existencias suficientes antes de procesar:
 * a) Despacho FEFO: Consulta stock total en lotes vigentes (fecha_vencimiento >= CURRENT_DATE).
 * b) Transferencia / Salida por Lote: Consulta stock en la posición específica (id_ubicacion_origen + id_lote).
 */
const validarStockDisponible = async (req, res, next) => {
  const { id_producto, cantidad_solicitada, cantidad, id_lote, id_ubicacion_origen } = req.body;

  try {
    // -------------------------------------------------------------
    // Caso A: Despacho FEFO (por producto y cantidad solicitada)
    // -------------------------------------------------------------
    if (cantidad_solicitada !== undefined || (req.path.includes('despacho') && cantidad !== undefined)) {
      const cantSolicitada = parseInt(cantidad_solicitada || cantidad, 10);
      const prodId = parseInt(id_producto, 10);

      if (isNaN(prodId) || prodId <= 0) {
        return respuestaError(
          res,
          400,
          'ERROR_PARAMETROS_INVALIDOS',
          'El id_producto proporcionado no es válido.'
        );
      }

      if (isNaN(cantSolicitada) || cantSolicitada <= 0) {
        return respuestaError(
          res,
          400,
          'ERROR_PARAMETROS_INVALIDOS',
          'La cantidad solicitada para el despacho debe ser un entero positivo mayor a 0.'
        );
      }

      // Consultar stock disponible únicamente en lotes NO vencidos
      const queryStockFefo = `
        SELECT COALESCE(SUM(iu.cantidad), 0)::int AS stock_disponible
        FROM inventario_ubicaciones iu
        INNER JOIN lotes l ON iu.id_lote = l.id_lote
        WHERE iu.id_producto = $1 
          AND iu.cantidad > 0
          AND l.fecha_vencimiento >= CURRENT_DATE;
      `;
      const resStock = await pool.query(queryStockFefo, [prodId]);
      const stockDisponible = resStock.rows[0].stock_disponible;

      if (cantSolicitada > stockDisponible) {
        return respuestaError(
          res,
          400,
          'ERROR_VALIDACION_STOCK',
          'Stock insuficiente para realizar el despacho',
          {
            cantidad_solicitada: cantSolicitada,
            stock_disponible_vigente: stockDisponible,
            deficit: cantSolicitada - stockDisponible,
          }
        );
      }

      // Inyectar en req para evitar consultas redundantes en el controlador
      req.stockDisponibleCalculado = stockDisponible;
      return next();
    }

    // -------------------------------------------------------------
    // Caso B: Transferencia o Salida específica de un lote y ubicación
    // -------------------------------------------------------------
    if (id_lote && id_ubicacion_origen && cantidad !== undefined) {
      const cantMover = parseInt(cantidad, 10);
      const prodId = parseInt(id_producto, 10);
      const loteId = parseInt(id_lote, 10);
      const ubiOrigenId = parseInt(id_ubicacion_origen, 10);

      if (isNaN(cantMover) || cantMover <= 0) {
        return respuestaError(
          res,
          400,
          'ERROR_PARAMETROS_INVALIDOS',
          'La cantidad debe ser un número entero mayor a 0.'
        );
      }

      const queryStockUbicacion = `
        SELECT COALESCE(cantidad, 0)::int AS stock_posicion
        FROM inventario_ubicaciones
        WHERE id_producto = $1 AND id_lote = $2 AND id_ubicacion = $3;
      `;
      const resStockUbi = await pool.query(queryStockUbicacion, [prodId, loteId, ubiOrigenId]);

      const stockDisponibleUbi = resStockUbi.rows.length > 0 ? resStockUbi.rows[0].stock_posicion : 0;

      if (cantMover > stockDisponibleUbi) {
        return respuestaError(
          res,
          400,
          'ERROR_VALIDACION_STOCK',
          'Stock insuficiente para realizar la operación en la ubicación origen',
          {
            cantidad_requerida: cantMover,
            stock_en_ubicacion: stockDisponibleUbi,
            deficit: cantMover - stockDisponibleUbi,
          }
        );
      }

      return next();
    }

    // Si no coincide con ninguno de los dos casos de salida, continuar
    return next();
  } catch (error) {
    console.error('Error en middleware validarStockDisponible:', error);
    return respuestaError(
      res,
      500,
      'ERROR_INTERNO_SERVIDOR',
      'Error interno al verificar la disponibilidad de existencias.',
      { detalle: error.message }
    );
  }
};

/**
 * ============================================================================
 * 2. MIDDLEWARE: VALIDAR CAPACIDAD DE UBICACIÓN (validarCapacidadUbicacion)
 * ============================================================================
 * Al registrar una entrada o transferencia hacia una ubicación objetivo,
 * calcula: stock_actual_en_ubicacion + nueva_cantidad.
 * Si supera 'capacidad_maxima', rechaza con HTTP 400.
 */
const validarCapacidadUbicacion = async (req, res, next) => {
  const idUbicacionDestino = req.body.id_ubicacion_destino || req.body.id_ubicacion;
  const cantidadNueva = parseInt(req.body.cantidad, 10);

  if (!idUbicacionDestino || isNaN(cantidadNueva) || cantidadNueva <= 0) {
    // Si no vienen estos campos, los validadores de formato de payload responderán
    return next();
  }

  const ubicId = parseInt(idUbicacionDestino, 10);

  try {
    // 1. Obtener la capacidad máxima y estado de la ubicación
    const queryUbicacion = `
      SELECT id_ubicacion, codigo_ubicacion, capacidad_maxima, activo
      FROM ubicaciones
      WHERE id_ubicacion = $1;
    `;
    const resUbic = await pool.query(queryUbicacion, [ubicId]);

    if (resUbic.rows.length === 0) {
      return respuestaError(
        res,
        404,
        'ERROR_UBICACION_NO_ENCONTRADA',
        `La ubicación física con ID ${ubicId} no existe en el sistema.`
      );
    }

    const ubicacion = resUbic.rows[0];

    if (!ubicacion.activo) {
      return respuestaError(
        res,
        400,
        'ERROR_UBICACION_INACTIVA',
        `La ubicación [${ubicacion.codigo_ubicacion}] está inactiva y no puede recibir mercancía.`
      );
    }

    // Si la ubicación tiene definida una capacidad máxima mayor a cero
    if (ubicacion.capacidad_maxima !== null && Number(ubicacion.capacidad_maxima) > 0) {
      const capMaxima = Number(ubicacion.capacidad_maxima);

      // 2. Calcular la suma del stock actual ocupado en esa ubicación física
      const queryStockActual = `
        SELECT COALESCE(SUM(cantidad), 0)::numeric AS stock_total_ocupado
        FROM inventario_ubicaciones
        WHERE id_ubicacion = $1;
      `;
      const resStock = await pool.query(queryStockActual, [ubicId]);
      const stockOcupado = Number(resStock.rows[0].stock_total_ocupado);

      const stockProyectado = stockOcupado + cantidadNueva;

      if (stockProyectado > capMaxima) {
        return respuestaError(
          res,
          400,
          'ERROR_CAPACIDAD_EXCEDIDA',
          'La ubicación destino supera su capacidad máxima permitida',
          {
            codigo_ubicacion: ubicacion.codigo_ubicacion,
            capacidad_maxima: capMaxima,
            stock_actual_ocupado: stockOcupado,
            cantidad_a_ingresar: cantidadNueva,
            stock_proyectado: stockProyectado,
            exceso_unidades: stockProyectado - capMaxima,
          }
        );
      }
    }

    return next();
  } catch (error) {
    console.error('Error en middleware validarCapacidadUbicacion:', error);
    return respuestaError(
      res,
      500,
      'ERROR_INTERNO_SERVIDOR',
      'Error interno al verificar la capacidad física de la ubicación.',
      { detalle: error.message }
    );
  }
};

/**
 * ============================================================================
 * 3. MIDDLEWARE: VALIDAR ESTADO DE LOTE EXPIRADO (validarEstadoLote)
 * ============================================================================
 * Verifica que la 'fecha_vencimiento' sea mayor a la fecha actual:
 * a) En despachos por lote específico o transferencias: Bloquea si fecha_vencimiento < CURRENT_DATE.
 * b) En despachos FEFO: Bloquea si todos los lotes del producto están vencidos.
 * c) En entradas de mercancía: Bloquea si intentan ingresar un lote con fecha vencida.
 */
const validarEstadoLote = async (req, res, next) => {
  const { id_lote, id_producto, fecha_vencimiento } = req.body;

  try {
    // -------------------------------------------------------------
    // Caso A: Validación por id_lote explícito (Salidas, Transferencias)
    // -------------------------------------------------------------
    if (id_lote) {
      const loteId = parseInt(id_lote, 10);
      const queryLote = `
        SELECT id_lote, numero_lote, TO_CHAR(fecha_vencimiento, 'YYYY-MM-DD') AS fecha_vencimiento,
               (fecha_vencimiento < CURRENT_DATE) AS esta_vencido
        FROM lotes
        WHERE id_lote = $1;
      `;
      const resLote = await pool.query(queryLote, [loteId]);

      if (resLote.rows.length === 0) {
        return respuestaError(
          res,
          404,
          'ERROR_LOTE_NO_ENCONTRADO',
          `El lote con ID ${loteId} no se encuentra registrado.`
        );
      }

      const lote = resLote.rows[0];

      if (lote.esta_vencido) {
        return respuestaError(
          res,
          400,
          'ERROR_LOTE_VENCIDO',
          'El lote seleccionado está vencido y bloqueado para despacho',
          {
            id_lote: lote.id_lote,
            numero_lote: lote.numero_lote,
            fecha_vencimiento: lote.fecha_vencimiento,
            estado: 'EXPIRADO',
          }
        );
      }

      return next();
    }

    // -------------------------------------------------------------
    // Caso B: Despacho FEFO sin id_lote (evaluar lotes del producto)
    // -------------------------------------------------------------
    if (id_producto && req.path.includes('despacho')) {
      const prodId = parseInt(id_producto, 10);

      const queryFefoLotes = `
        SELECT 
          COUNT(*) FILTER (WHERE l.fecha_vencimiento < CURRENT_DATE AND iu.cantidad > 0)::int AS lotes_vencidos,
          COUNT(*) FILTER (WHERE l.fecha_vencimiento >= CURRENT_DATE AND iu.cantidad > 0)::int AS lotes_vigentes
        FROM inventario_ubicaciones iu
        INNER JOIN lotes l ON iu.id_lote = l.id_lote
        WHERE iu.id_producto = $1;
      `;
      const resFefo = await pool.query(queryFefoLotes, [prodId]);
      const { lotes_vencidos, lotes_vigentes } = resFefo.rows[0];

      if (lotes_vigentes === 0 && lotes_vencidos > 0) {
        return respuestaError(
          res,
          400,
          'ERROR_LOTE_VENCIDO',
          'El lote seleccionado está vencido y bloqueado para despacho',
          {
            mensaje_adicional: 'Todos los lotes con existencias físicas de este producto están expirados.',
            lotes_expirados_con_stock: lotes_vencidos,
          }
        );
      }

      return next();
    }

    // -------------------------------------------------------------
    // Caso C: Entrada de mercancía con fecha_vencimiento en el cuerpo
    // -------------------------------------------------------------
    if (fecha_vencimiento && req.path.includes('entrada')) {
      const hoy = new Date();
      hoy.setHours(0, 0, 0, 0);

      const fechaVenc = new Date(fecha_vencimiento);
      fechaVenc.setHours(0, 0, 0, 0);

      if (fechaVenc < hoy) {
        return respuestaError(
          res,
          400,
          'ERROR_LOTE_VENCIDO',
          'No se puede recepcionar mercancía con una fecha de vencimiento ya expirada.',
          {
            fecha_vencimiento_ingresada: fecha_vencimiento,
            fecha_actual_sistema: hoy.toISOString().split('T')[0],
          }
        );
      }

      return next();
    }

    return next();
  } catch (error) {
    console.error('Error en middleware validarEstadoLote:', error);
    return respuestaError(
      res,
      500,
      'ERROR_INTERNO_SERVIDOR',
      'Error interno al verificar la vigencia de los lotes.',
      { detalle: error.message }
    );
  }
};

/**
 * ============================================================================
 * 4. MIDDLEWARE: VALIDAR MISMA UBICACIÓN EN TRANSFERENCIA (validarMismaUbicacion)
 * ============================================================================
 * Impide transferencias donde origen sea igual a destino.
 */
const validarMismaUbicacion = (req, res, next) => {
  const ubiOrigen = parseInt(req.body.id_ubicacion_origen, 10);
  const ubiDestino = parseInt(req.body.id_ubicacion_destino, 10);

  if (ubiOrigen && ubiDestino && ubiOrigen === ubiDestino) {
    return respuestaError(
      res,
      400,
      'ERROR_MISMA_UBICACION',
      'La ubicación de origen no puede ser igual a la ubicación de destino',
      {
        id_ubicacion_origen: ubiOrigen,
        id_ubicacion_destino: ubiDestino,
      }
    );
  }

  return next();
};

module.exports = {
  respuestaError,
  validarStockDisponible,
  validarCapacidadUbicacion,
  validarEstadoLote,
  validarMismaUbicacion,
};
