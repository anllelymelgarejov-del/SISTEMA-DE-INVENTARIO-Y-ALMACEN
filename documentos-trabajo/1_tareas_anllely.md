# 📋 Hoja de Tareas: Base de Datos y Repositorio
**Responsable:** Anllely Melgarejo  
**Rol:** Líder del Proyecto & Arquitecta de Datos (Main)  

---

### 🎯 Objetivo Principal
Diseñar, implementar y mantener la base de datos relacional en PostgreSQL, garantizando la integridad de los datos, reglas de no negatividad y la inmutabilidad del Kárdex. Coordinar y administrar el repositorio en GitHub (aprobación de Pull Requests).

### 🛠️ Tareas Específicas
1. **Modelado y Esquema Relacional (`base-de-datos/01_schema.sql`):**
   - Crear tablas: `usuarios`, `articulos`, `lotes`, `kardex`.
   - Implementar tipos ENUM para roles (`ADMINISTRADOR`, `ALMACENERO`, `CONSULTA`), estado del artículo (`ACTIVO`, `INACTIVO`, `DESCONTINUADO`) y movimientos (`ENTRADA`, `SALIDA`, `AJUSTE_SOBRANTE`, `AJUSTE_FALTANTE`).
2. **Reglas de Integridad y Restricciones:**
   - Configurar `CHECK (stock_disponible >= 0)` en la tabla `lotes` para impedir stock negativo a nivel de motor.
   - Definir llaves foráneas con `ON DELETE RESTRICT` para evitar eliminaciones accidentales de registros vinculados al Kárdex.
3. **Optimización e Índices:**
   - Crear índices B-Tree en `articulos(codigo_barras)` y `articulos(sku)` para agilizar lecturas por escáner.
   - Crear índice compuesto en `lotes(articulo_id, fecha_vencimiento ASC)` para optimizar consultas del algoritmo FEFO.
4. **Control del Repositorio:**
   - Proteger la rama `main` en GitHub.
   - Revisar y aprobar los Pull Requests que envíen Isai, Duque, Tania, Jhasy y Valentin.

### ✅ Criterios de Aceptación
- La base de datos se ejecuta sin errores en PostgreSQL (`sgi_almacen_db`).
- Ninguna operación permite dejar stock en números negativos.
- El script SQL inicial está subido y versionado en GitHub.