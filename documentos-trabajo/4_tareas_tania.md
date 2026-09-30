# 📋 Hoja de Tareas: Frontend de Captura y Códigos de Barras
**Responsable:** Tania Tapullima  
**Rol:** Frontend Developer (Captura y Formularios)  


---

### 🎯 Objetivo Principal
Construir las interfaces de usuario para la gestión del catálogo de artículos y optimizar la interacción con escáneres de código de barras USB Plug & Play.

### 🛠️ Tareas Específicas
1. **Formularios de Registro y Edición:**
   - Vista de catálogo con formulario modal para registrar y editar artículos (SKU, nombre, categoría, unidad de medida, ubicación: zona, estante, fila).
   - Componente visual para cambiar el estado del artículo (Activo, Inactivo, Descontinuado).
2. **Generación e Impresión de Códigos:**
   - Integrar librería cliente (ej. `jsbarcode`) para renderizar etiquetas con código de barras en pantalla.
   - Botón para imprimir etiquetas en formato estándar para estanterías.
3. **Soporte para Escáner USB:**
   - Configurar campos de texto con autofoco automático.
   - Capturar el evento `Enter` enviado por el lector USB tras el escaneo para disparar la búsqueda inmediata sin requerir clic del usuario.

### ✅ Criterios de Aceptación
- La interfaz es responsiva (usable en tabletas y laptops de almacén).
- Al escanear un código de barras con el lector USB, el formulario carga la información del producto automáticamente.
- Las etiquetas de código de barras se renderizan nítidas y listas para impresión.