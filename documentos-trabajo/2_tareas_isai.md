# 📋 Hoja de Tareas: Seguridad y Catálogo Maestro
**Responsable:** Isai Huaman  
**Rol:** Backend Developer (Seguridad y Catálogo)  

---

### 🎯 Objetivo Principal
Desarrollar el sistema de autenticación, autorización por roles (RBAC) y los servicios REST para la gestión del catálogo de artículos y sus ubicaciones en el almacén.

### 🛠️ Tareas Específicas
1. **Módulo 7 - Seguridad y Autenticación:**
   - Endpoint `POST /api/auth/login` con generación de JSON Web Tokens (JWT).
   - Encriptación de contraseñas con `bcryptjs`.
   - Middleware de protección de rutas y validación de roles:
     * `ADMINISTRADOR`: Acceso total.
     * `ALMACENERO`: Gestión operativa (artículos, entradas, salidas).
     * `CONSULTA`: Solo lectura (`GET`).
2. **Módulo 1 - Catálogo Maestro de Artículos:**
   - Endpoints CRUD:
     * `GET /api/articulos`: Listado con soporte para filtros por categoría o estado.
     * `POST /api/articulos`: Registro de nuevo artículo (validando SKU y código de barras únicos).
     * `PUT /api/articulos/:id`: Actualización de datos maestros (precios, stock mín/seg/máx, ubicación zona-estante-fila).
     * `DELETE /api/articulos/:id`: Implementación de **Baja Lógica** (cambia estado a `INACTIVO` o `DESCONTINUADO`, nunca borra el registro físico).

### ✅ Criterios de Aceptación
- Un usuario no autenticado no puede acceder a las rutas protegidas.
- Un usuario con rol `CONSULTA` recibe HTTP 403 al intentar crear o editar artículos.
- No se permite duplicar SKUs ni códigos de barras en el catálogo.