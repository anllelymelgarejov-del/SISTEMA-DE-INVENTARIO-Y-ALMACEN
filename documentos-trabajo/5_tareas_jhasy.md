# 📋 Hoja de Tareas: Frontend de Control y Semáforo de Stock
**Responsable:** Jhasy  
**Rol:** Frontend Developer (Dashboard y Monitoreo)  


---

### 🎯 Objetivo Principal
Diseñar y programar el panel de control operativo: monitor de existencias con semáforo visual de alerta, filtros dinámicos y la generación del Vale de Salida imprimible.

### 🛠️ Tareas Específicas
1. **Módulo 4 - Semáforo y Monitor de Stock:**
   - Panel de tarjetas y tabla con codificación de colores en tiempo real:
     * 🟢 **Verde:** Existencias óptimas (por encima del punto de reposición).
     * 🟡 **Ámbar:** Stock bajo (igual o menor al stock mínimo configurado).
     * 🔴 **Rojo:** Crítico o agotado (stock igual a 0).
   - Buscador multifiltro: por SKU, nombre, categoría o coordenadas de ubicación (zona-estante-fila).
2. **Módulo 3 - Asistencia de Despacho y Vale de Salida:**
   - Pantalla interactiva de salida que muestre al operario la ubicación exacta del lote asignado por FEFO.
   - Vista previa e impresión del **Vale de Salida** con datos de responsable, fecha, lote y cantidad despachada.
3. **Módulo 5 - Visualizador del Kárdex:**
   - Tabla histórica de movimientos con paginación y filtros por rango de fecha y producto.

### ✅ Criterios de Aceptación
- El cambio de color del semáforo reacciona correctamente a los umbrales de stock definidos.
- El vale de salida se genera con diseño limpio y listo para enviar a la impresora.
- Los filtros de búsqueda devuelven resultados de manera instantánea.
