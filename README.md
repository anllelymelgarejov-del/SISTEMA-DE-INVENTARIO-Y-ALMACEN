# 📦 SGI Almacén Pro (Sistema de Gestión de Almacenes WMS)

[![Node.js](https://img.shields.io/badge/Node.js-v18%2B-green?logo=node.js)](https://nodejs.org/)
[![Express](https://img.shields.io/badge/Express-v5.x-lightgrey?logo=express)](https://expressjs.com/)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-v14%2B-blue?logo=postgresql)](https://www.postgresql.org/)
[![Bootstrap](https://img.shields.io/badge/Bootstrap-v5.3-purple?logo=bootstrap)](https://getbootstrap.com/)
[![License](https://img.shields.io/badge/License-ISC-blue.svg)](#licencia)

---

## 📖 Descripción General

**SGI Almacén Pro** es una solución integral y moderna para la gestión operativa y administrativa de inventarios y almacenes (*Warehouse Management System - WMS*). El sistema está diseñado para optimizar el flujo de inventario multialmacén, garantizando la trazabilidad estricta de productos mediante:

- **Control de Stock Multialmacén:** Visualización segmentada y filtrada en tiempo real de las existencias por cada sede física o depósito.
- **Gestión por Lotes y Caducidad (Estrategia FEFO):** Priorización de salida por método *First Expired, First Out* con un semáforo visual de caducidad (crítico, próximo, óptimo y vencido).
- **Kardex y Auditoría de Movimientos:** Registro inmutable de cada transacción de entrada (+) y salida / despacho (-), documentando fecha, almacén, producto, lote, cantidad y el usuario responsable de la operación.
- **Seguridad y Control de Acceso Basado en Roles (RBAC):** Interfaces personalizadas y endpoints protegidos con autenticación JWT para diferenciar las funciones de operarios y administradores.

---

## 🛠️ Stack Tecnológico

El proyecto está construido bajo una arquitectura cliente-servidor desacoplada, ligera y de alto rendimiento:

- **Backend:**
  - **Node.js:** Entorno de ejecución en JavaScript del lado del servidor.
  - **Express:** Framework web minimalista para la creación de APIs REST seguras y modulares.
  - **JSON Web Tokens (JWT):** Autenticación sin estado para proteger endpoints privados.
  - **bcryptjs:** Encriptación y hashing seguro de contraseñas.
- **Base de Datos:**
  - **PostgreSQL:** Sistema de gestión de bases de datos relacional robusto, transaccional y escalable.
  - **node-postgres (`pg`):** Cliente de conexión con soporte para transacciones ACID (`BEGIN`, `COMMIT`, `ROLLBACK`).
- **Frontend:**
  - **HTML5 & CSS3:** Estructura semántica, variables CSS modernas y diseño adaptativo (*Mobile-First*).
  - **JavaScript Vanilla (ES6+):** Lógica asíncrona (`fetch`, `async/await`) sin dependencias pesadas de frameworks externos.
  - **Bootstrap 5.3:** Sistema de grillas, componentes interactivos (pestañas, modales, alertas y botones).
  - **SweetAlert2 & FontAwesome 6:** Notificaciones estilizadas e iconografía profesional.

---

## Módulos de la API

| Módulo | Ruta base | Operaciones principales |
| :--- | :--- | :--- |
| Autenticación | `/api/auth` | Inicio de sesión y perfil JWT |
| Usuarios | `/api/usuarios` | Consulta, alta y baja administrativa |
| Almacenes | `/api/almacenes` | Consulta de almacenes |
| Productos | `/api/productos` | Consulta y alta de productos |
| Inventario y lotes | `/api/inventario` | Existencias por almacén, producto y lote |
| Movimientos (Kardex) | `/api/movimientos` | Registro de entradas/salidas e historial |
| Transferencias | `/api/transferencias` | Historial, detalle y transferencia atómica de stock entre almacenes |
| Reportes | `/api/reportes` | Exportación de inventario e historial a Excel |

Las rutas de transferencias requieren `Authorization: Bearer <token>` y están disponibles para Administrador y Operario.

## 👥 Roles de Usuario y Permisos

| Rol | Icono | Responsabilidades y Permisos |
| :--- | :---: | :--- |
| **Administrador** | 👨‍💼 | Gestión de usuarios, catálogo de productos, almacenes, transferencias y auditoría completa del Kardex. |
| **Operario** | 👷‍♂️ | Consulta de stock, entradas y salidas por lote, transferencias entre almacenes e historial de movimientos. |
---

## 📋 Requisitos Previos

Antes de comenzar la instalación, asegúrate de contar con las siguientes herramientas instaladas en tu equipo:

1. **[Node.js](https://nodejs.org/)** versión `18.x` o superior (incluye `npm`).
2. **[PostgreSQL](https://www.postgresql.org/)** versión `14.x` o superior (o una instancia gestionada en la nube como Supabase / Render / Neon).
3. **[Git](https://git-scm.com/)** para el control de versiones.

---

## 🚀 Guía de Instalación Paso a Paso

Sigue estos pasos en tu terminal para clonar, configurar y ejecutar el proyecto localmente:

### 1. Clonar el repositorio
```bash
git clone <URL_DEL_REPOSITORIO>
cd sistema-inventario
```

### 2. Instalar dependencias
Instala los paquetes de Node.js requeridos por el backend:
```bash
npm install
```

### 3. Configurar variables de entorno
Copia la plantilla de variables de entorno y renómbrala a `.env`:

```bash
# En Windows (PowerShell)
Copy-Item .env.example .env

# En Linux / macOS / Bash
cp .env.example .env
```

Edita el archivo `.env` configurando las credenciales de tu base de datos y la clave secreta de JWT:

```env
# Puerto del servidor
PORT=3000

# Parámetros de conexión a PostgreSQL
DB_HOST=localhost
DB_PORT=5432
DB_USER=postgres
DB_PASSWORD=tu_password_aqui
DB_NAME=sis_inv_almacen

# Seguridad JWT
JWT_SECRET=tu_clave_secreta_jwt_muy_segura_2026
JWT_EXPIRES_IN=24h
```

> **Nota (nube):** Si utilizas una base de datos en la nube (como Supabase o Render), configura la variable `DATABASE_URL` con tu cadena de conexión URI.

> **Nota (local):** Para usar PostgreSQL local (pgAdmin), deja `DATABASE_URL` **comentada o sin definir** y llena `DB_USER`, `DB_HOST`, `DB_NAME`, `DB_PASSWORD` y `DB_PORT`. Si defines `DATABASE_URL`, el backend la usará a ella (con SSL) en lugar de la conexión local.

### 4. Configurar la Base de Datos PostgreSQL
Primero crea la base de datos y luego ejecuta el esquema oficial `database/script_definitivo.sql`, que crea las tablas que falten y agrega los datos semilla sin borrar ni sobrescribir información existente:

```bash
# 1) Crear la base de datos (si aún no existe)
psql -U postgres -c "CREATE DATABASE sis_inv_almacen;"

# 2) Ejecutar el esquema oficial (tablas + datos de prueba)
psql -U postgres -d sis_inv_almacen -f database/script_definitivo.sql
```

El script es **idempotente**: puedes ejecutarlo varias veces. Para reiniciar una base de desarrollo desde cero, ejecuta primero `database/reset_dev.sql`; este archivo elimina las tablas y sus datos.

> **Nota:** `database.sql` fue retirado por obsoleto. El esquema vigente es `database/script_definitivo.sql`.

### 🗄️ Alternativa desde pgAdmin

1. Abre tu cliente de base de datos (pgAdmin).
2. Crea una base de datos llamada `sis_inv_almacen`:
   ```sql
   CREATE DATABASE sis_inv_almacen;
   ```
3. Clic derecho sobre la base `sis_inv_almacen` > **Query Tool**.
4. Abre el archivo `database/script_definitivo.sql` y presiona **F5** (Run) para crear las tablas faltantes y agregar los datos iniciales.
5. Configura tus credenciales de conexión en tu archivo `.env` local.


### 5. Iniciar el Servidor

Para iniciar en **modo producción**:
```bash
npm start
```

Para iniciar en **modo desarrollo** (con recarga automática de cambios):
```bash
npm run dev
```

El servidor estará disponible en:
```text
http://localhost:3000
```

---

## 🔑 Credenciales de Acceso Inicial (Datos Semilla)

| Rol | Correo Electrónico | Contraseña |
| :--- | :--- | :--- |
| **Administrador** | `admin@almacen.com` | `admin123` |
| **Operario** | `operario@almacen.com` | `admin123` |

---

## Datos de Prueba y Verificación

Con la base `sis_inv_almacen` creada y el esquema aplicado, carga los datos de demostración:

```bash
psql -U postgres -d sis_inv_almacen -f database/seed_demo.sql
```

Inicia el servidor en una terminal y, desde otra, ejecuta el smoke test:

```bash
npm start
npm run test:smoke
```

El smoke test usa `admin@almacen.com` / `admin123` por defecto y consulta `http://localhost:3000`. Puedes configurar `SMOKE_BASE_URL`, `SMOKE_EMAIL` y `SMOKE_PASSWORD` para otro entorno. Por defecto no escribe datos. El flag opcional `npm run test:smoke -- --write` crea una transferencia real de una unidad para probar el flujo completo.

El script oficial `database/script_definitivo.sql` también inserta las cuentas iniciales: `admin@almacen.com` y `operario@almacen.com`, ambas con contraseña `admin123` en instalaciones nuevas.

## 📁 Estructura del Proyecto

```text
sistema-inventario/
├── database/                # Esquema oficial y reinicio solo para desarrollo
│   ├── script_definitivo.sql
│   └── reset_dev.sql
├── public/                  # Frontend estático servido por Express
│   ├── app.js               # Controlador JS Vanilla, estado e interactividad
│   ├── index.html           # Dashboard principal (Inventario, Historial, Gestión)
│   └── login.html           # Vista de inicio de sesión estilizada y responsive
├── src/                     # Código fuente del backend (Node.js + Express)
│   ├── config/              # Configuración de conexiones (Pool de PostgreSQL)
│   │   └── db.js
│   ├── middlewares/         # Middlewares de seguridad y validación JWT
│   │   └── auth.js
│   ├── routes/              # Rutas modulares de la API REST
│   │   ├── almacenes.js     # Endpoints de almacenes
│   │   ├── auth.js          # Autenticación y login
│   │   ├── inventario.js     # Stock, lotes y semáforo FEFO
│   │   ├── movimientos.js    # Kardex y registro de entradas/salidas
│   │   ├── productos.js      # Catálogo de productos
│   │   ├── reportes.js       # Reportes y exportación
│   │   └── usuarios.js       # Gestión de usuarios por el ADMIN
│   └── index.js             # Punto de entrada principal y servidor Express
├── .env.example             # Plantilla de variables de entorno
├── .gitignore               # Exclusiones para el repositorio Git
├── package.json             # Manifiesto de dependencias y scripts de npm
└── README.md                # Documentación oficial del proyecto
```

---

## 🛡️ Licencia

Distribuido bajo la licencia **ISC**. Para más detalles, consulta el archivo `package.json`.
