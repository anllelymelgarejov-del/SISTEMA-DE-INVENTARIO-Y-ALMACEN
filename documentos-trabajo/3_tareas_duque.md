# 📋 Hoja de Tareas: Movimientos y Kárdex
**Responsable:** Duque  
**Rol:** Backend Developer (Lógica Transaccional) 

---

### 🎯 Objetivo Principal
Implementar el motor transaccional del almacén: recepción con conteo a ciegas, despacho automatizado bajo la metodología FEFO y el registro inmutable del Kárdex con costo promedio ponderado.

### 🛠️ Tareas Específicas
1. **Módulo 2 - Entradas y Recepción Ciega:**
   - Endpoint `POST /api/movimientos/entradas`.
   - Regla de conteo ciego: El API para el operario solo recibe el SKU/código y el conteo físico real, registrando el lote y su fecha de caducidad.
2. **Módulo 3 - Salidas y Despacho FEFO:**
   - Endpoint `POST /api/movimientos/salidas`.
   - Lógica FEFO (*First Expired, First Out*): Seleccionar automáticamente el lote con fecha de caducidad más cercana que tenga stock disponible.
   - Validación obligatoria: Si la cantidad solicitada supera el stock disponible total, la transacción se aborta con error HTTP 400.
3. **Módulo 5 - Kárdex Inmutable:**
   - Cada entrada, salida o ajuste auditado debe insertar una fila inmutable en la tabla `kardex` dentro de una transacción SQL (`BEGIN ... COMMIT`).
   - Cálculo automático del Costo Promedio Ponderado en cada entrada.
   - Endpoint `POST /api/movimientos/ajuste` para registrar sobrantes o faltantes sin modificar el historial previo.

### ✅ Criterios de Aceptación
- Las transacciones de entrada y salida son atómicas (si algo falla, se ejecuta `ROLLBACK`).
- No es posible realizar una salida si el stock resultante sería menor a cero.
- La tabla Kárdex solo admite sentencias `INSERT`; nunca `UPDATE` ni `DELETE`.