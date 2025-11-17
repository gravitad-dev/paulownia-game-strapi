````markdown
# Paulownia Game — Backend (Strapi)

Este repositorio contenía el backend del juego **Paulownia**, desarrollado con **Strapi**, un CMS headless que ofrecía una API flexible para gestionar contenido del proyecto (usuarios, progreso, datos del juego, etc.).

---

## 🔍 Estructura del proyecto

- **config/** — configuración principal de Strapi (base de datos, server, plugins).
- **data/** — datos iniciales o semillas del proyecto.
- **database/migrations/** — migraciones de esquema.
- **public/** — archivos estáticos expuestos públicamente.
- **scripts/** — scripts de utilidad.
- **src/** — controladores, modelos, servicios, rutas y componentes del proyecto.
- **Dockerfile**, **Dockerfile.dev**, **Dockerfile.prod** — archivos de construcción para distintos entornos.
- **docker-compose.yml** — orquestación de contenedores.
- **.env.example** — plantilla de variables de entorno.

---

## 🚀 Instalación y Ejecución

### Requisitos previos

- Node.js compatible con la versión usada por Strapi en el proyecto.
- Docker y Docker Compose (opcional pero recomendado).
- Base de datos compatible según la configuración del proyecto.

---

## 🛠️ Configuración del Entorno

Primero, copia el archivo de variables de entorno:

```bash
cp .env.example .env
````

Ajusta las variables según tu entorno local.

---

## 🐳 Uso con Docker

Este proyecto podía ejecutarse tanto en **desarrollo** como en **producción** utilizando Docker.
Para ello, era fundamental configurar correctamente las variables de entorno.

### Variables de entorno para Development

Usa estos valores dentro de `.env` si deseas ejecutar el backend en modo desarrollo usando Docker:

```env
# Configure Development Deploy Environment
DOCKERFILE=./Dockerfile.dev
IMAGE=strapi:dev
NODE_ENV=development
```

Dejando comentadas las lineas:

```
# Configure Production Deploy Environment
#IMAGE=strapi:prod
#DOCKERFILE=./Dockerfile.prod
#NODE_ENV=production
```

### Ejecutar en modo Development

```bash
docker compose up --build
```

Esto construía el contenedor usando **Dockerfile.dev** y ejecutaba Strapi en modo **development**, permitiendo:

* Hot reload
* Cambios de código visibles en tiempo real
* Logs detallados

---

## 🛠️ Despliegue en Producción

La configuración soportaba:

* Construcción mediante **Dockerfile.prod**
* Ejecución con `docker-compose`
* Integración con cualquier proveedor capaz de correr contenedores Docker o Node.js

Usa estos valores dentro de `.env` si deseas ejecutar el backend en modo producción usando Docker:

```env
# Configure Development Deploy Environment
IMAGE=strapi:prod
DOCKERFILE=./Dockerfile.prod
NODE_ENV=production

```

Dejando comentadas las lineas:

```
# Configure Production Deploy Environment
#DOCKERFILE=./Dockerfile.dev
#IMAGE=strapi:dev
#NODE_ENV=development
```

### Ejecutar en modo Production

```bash
docker compose up -d
```

---


## 🧭 API

Strapi generaba automáticamente endpoints REST para cada **Content-Type** creado dentro de `src/`.

Ejemplos típicos:

* `/api/[content-type]`
* `/admin` → Interfaz de administración.

> Nota: Se recomienda documentar aquí los modelos usados en el proyecto si deseas extender este README.

---

---

## 💡 Contribuir

1. Realiza un fork del repositorio.
2. Crea una rama nueva: `feature/xxx` o `fix/xxx`.
3. Aplica tus cambios.
4. Prueba localmente.
5. Envía un Pull Request bien documentado.

---

## 📚 Recursos

* Documentación oficial de Strapi
* Comunidad en Discord
* Repositorio oficial en GitHub

---

## ⚖️ Licencia

Consulte el archivo `LICENSE` incluido en el repositorio.

---
