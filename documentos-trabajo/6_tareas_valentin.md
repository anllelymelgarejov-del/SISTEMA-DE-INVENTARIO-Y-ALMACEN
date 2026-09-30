# 📋 Hoja de Tareas: Reportes, Compras Sugeridas y Pruebas
**Responsable:** Valentin  
**Rol:** Fullstack / QA Tester (Reportes y Pruebas)  

---

### 🎯 Objetivo Principal
Implementar el módulo de compras sugeridas automáticas, la exportación de reportes operativos a Excel/PDF y liderar las pruebas de integración de todo el flujo del sistema.

### 🛠️ Tareas Específicas
1. **Módulo 6 - Compras Sugeridas y Reabastecimiento:**
   - Endpoint y vista para detectar artículos en estado Ámbar o Rojo.
   - Cálculo automático de la cantidad a pedir:
     $$\text{Cantidad a Solicitar} = \text{Stock Máximo} - \text{Stock Actual}$$
   - Generación de lista preliminar de orden de compra en 1 clic.
2. **Exportación de Reportes:**
   - Exportación de listados a formato CSV (compatible con Excel) y PDF (ej. con `jspdf` o en backend con `pdfkit`).
   - Reporte de inventario valorizado (suma del valor contable de los lotes activos).
3. **Plan de Pruebas de Integración (QA):**
   - Diseñar y ejecutar casos de prueba para el flujo completo:
     1. Alta de producto en catálogo (Isai / Tania).
     2. Entrada con recepción ciega (Duque / Tania).
     3. Alerta en semáforo (Jhasy).
     4. Salida con FEFO y bloqueo de negativo (Duque / Jhasy).
     5. Verificación de saldo en Kárdex inmutable (Anllely / Duque).

### ✅ Criterios de Aceptación
- El reporte de compras sugeridas solo incluye artículos que hayan alcanzado o superado el umbral mínimo.
- La exportación a CSV y PDF descarga archivos legibles y con los datos consolidados.
- La matriz de pruebas cubre todos los módulos sin registrar errores en transacciones.