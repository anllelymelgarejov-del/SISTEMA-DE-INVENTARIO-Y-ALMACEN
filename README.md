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

## 👥 Roles de Usuario y Permisos

El sistema implementa dos perfiles con interfaces dinámicas adaptadas a sus funciones operativas:

| Rol | Icono | Responsabilidades y Permisos |
| :--- | :---: | :--- |
| **Administrador** | 👨‍💼 | **Control Total del Sistema:** Gestión y creación de usuarios, configuración del catálogo maestro de productos (códigos de barras, precios y descripción), administración de almacenes, operaciones generales por lote y auditoría completa del Kardex. |
| **Operario** | 👷‍♂️ | **Operativa de Almacén:** Acceso directo a las tarjetas de almacén para consulta de stock disponible en tiempo real, registro rápido de entradas (+), registro de despachos/salidas (-) por lote y visualización del historial de movimientos. |

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
Primero crea la base de datos y luego ejecuta el esquema oficial `database/script_definitivo.sql`, que crea **todas las tablas y los datos semilla** (incluidos los usuarios de acceso):

```bash
# 1) Crear la base de datos (si aún no existe)
psql -U postgres -c "CREATE DATABASE sis_inv_almacen;"

# 2) Ejecutar el esquema oficial (tablas + datos de prueba)
psql -U postgres -d sis_inv_almacen -f database/script_definitivo.sql
```

El script es **idempotente**: puedes ejecutarlo las veces que quieras sin obtener errores.

> **Nota:** `database.sql` quedó **obsoleto** (pertenecía al esquema antiguo). No lo uses: el esquema vigente es `database/script_definitivo.sql`.

### 🗄️ Alternativa desde pgAdmin

1. Abre tu cliente de base de datos (pgAdmin).
2. Crea una base de datos llamada `sis_inv_almacen`:
   ```sql
   CREATE DATABASE sis_inv_almacen;
   ```
3. Clic derecho sobre la base `sis_inv_almacen` > **Query Tool**.
4. Abre el archivo `database/script_definitivo.sql` y presiona **F5** (Run) para crear todas las tablas y datos iniciales.
5. Configura tus credenciales de conexión en tu archivo `backend/.env` local.


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

## 📁 Estructura del Proyecto

```text
sistema-inventario/
├── backend/                 # Servidor Backend (Node.js + Express 5 + PostgreSQL)
│   ├── src/
│   │   ├── config/
│   │   │   └── db.js        # Pool de conexiones PostgreSQL (Local y Cloud SSL)
│   │   ├── middlewares/
│   │   │   ├── auth.js      # Autenticación JWT y control RBAC (verificarToken, verificarRol)
│   │   │   └── validaciones.js
│   │   ├── routes/
│   │   │   ├── almacenes.js # Endpoints de sedes y almacenes
│   │   │   ├── auditoria.js # Bitácora forense inmutable (logs_auditoria)
│   │   │   ├── auth.js      # Login JWT y perfil
│   │   │   ├── inventario.js# Stock por lote, semáforo FEFO y alertas de stock mínimo
│   │   │   ├── movimientos.js # Kardex transaccional ACID y bloqueo FEFO
│   │   │   ├── productos.js # Catálogo maestro de productos
│   │   │   ├── reportes.js  # Exportación Excel (.xlsx) con ExcelJS
│   │   │   ├── usuarios.js  # Gestión y baja selectiva segura de usuarios (ADMIN)
│   │   │   └── wms.js
│   │   └── index.js         # Punto de entrada principal Express
│   ├── .env.example         # Plantilla de variables de entorno
│   └── package.json
├── database/
│   └── script_definitivo.sql# Esquema oficial PostgreSQL + datos semilla
├── frontend/                # Interfaz Web (HTML5, CSS3, Bootstrap 5.3, JS Vanilla)
│   ├── app.js               # Controlador principal, modales, FEFO, Kardex y notificaciones
│   ├── dashboard.css        # Estilos corporativos SIA, vistas Admin y Operario
│   ├── dashboard.js         # Métricas y gráficos analíticos del Dashboard
│   ├── fondobanner-admin.png# Banner local de la Suite Ejecutiva (Administrador)
│   ├── fondobanner-opera.png# Banner local del Dashboard Operativo (Operario)
│   ├── index.html           # Panel principal SIA multi-rol
│   └── login.html           # Acceso corporativo con JWT
├── .gitignore               # Exclusiones de Git (node_modules, .env, logs)
├── database.sql             # ⚠️ Obsoleto (usar database/script_definitivo.sql)
├── package.json             # Scripts raíz (npm run dev / npm start)
└── README.md                # Documentación oficial del proyecto
```

---

## 🛡️ Licencia

Distribuido bajo la licencia **ISC**. Para más detalles, consulta el archivo `package.json`.
