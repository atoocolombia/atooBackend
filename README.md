# Backend (API + base de datos)

Express + TypeScript + Prisma + PostgreSQL.

## Qué necesitas para la base de datos

1. **PostgreSQL** en ejecución (versión 14 o superior recomendada).
2. Una **cadena de conexión** `DATABASE_URL` en tu archivo `.env`.

### Opción A: PostgreSQL con Docker (rápido en local)

Desde esta carpeta (`backend/`):

```bash
docker compose up -d
```

Eso levanta PostgreSQL accesible en tu Mac en el puerto **5433** (el contenedor usa 5432 por dentro; 5433 evita choque con otro Postgres en 5432).

- usuario: `landing`
- contraseña: `landing`
- base de datos: `landing`

Copia `.env.example` a `.env` y deja `DATABASE_URL` como en el ejemplo (usa `localhost:5433`).

### Opción B: PostgreSQL instalado en tu Mac

Crea una base de datos y un usuario, y arma la URL:

```text
postgresql://USUARIO:CONTRASEÑA@localhost:5432/NOMBRE_BD?schema=public
```

Pégala en `.env` como `DATABASE_URL=...`.

## Configuración inicial (una vez)

```bash
cd backend
cp .env.example .env
# Edita .env si tu PostgreSQL no usa los valores por defecto de Docker

npm install
npm run db:generate
npm run db:migrate:deploy
```

- `db:generate` — genera el cliente Prisma a partir de `prisma/schema.prisma`.
- `db:migrate:deploy` — aplica las migraciones ya incluidas en el repo (crea tablas). Úsalo la **primera vez** o en CI/producción.

Cuando **cambies** el esquema y quieras generar una migración nueva en desarrollo:

```bash
npm run db:migrate
```

Prisma te pedirá un nombre para la migración y actualizará `prisma/migrations/`.

## Desarrollo

```bash
npm run dev
```

API:

- `GET /health`
- `GET /api/v1`
- **Vehículos (ejemplo CRUD):**
  - `GET /api/v1/vehicles`
  - `GET /api/v1/vehicles/:id`
  - `POST /api/v1/vehicles` — body JSON: `{ "name": "...", "brand": "...", "price": 123 }`
- **Usuarios (registro):**
  - Tabla `User`: `email` (único), `passwordHash` (bcrypt, nunca contraseña en claro), `userType` (`USER` | `ADVISOR` | `ADMIN` | `ANALYST`).
  - `POST /api/v1/auth/register` — body JSON: `{ "email": "a@b.com", "password": "mínimo 8 caracteres", "userType": "USER" }`
  - `POST /api/v1/auth/login` — body JSON: `{ "email": "a@b.com", "password": "..." }`
  - Respuesta (registro y login): `id`, `email`, `userType`, `createdAt` (sin devolver el hash).

La contraseña se guarda como **hash bcrypt** (un solo sentido); no es cifrado reversible, que es lo recomendado para contraseñas en servidores.

**Documentos por usuario** (tabla `Document` en BD; bytes en carpeta `uploads/`, ignorada por git):

- Cada documento tiene **`documentKind`**, **`validationStatus`**: `PENDING` | `VALIDATED` | `REJECTED`, y opcionalmente **`validationMessage`** (motivo de rechazo, p. ej. texto de la verificación automática).
- `GET /api/v1/users/:userId/documents` — lista metadatos (incluye `documentKind`, `validationStatus` y `validationMessage` si aplica).
- `POST /api/v1/users/:userId/documents` — `multipart/form-data`: campo **`file`** y campo de texto **`documentKind`**. Si ya existía ese tipo para el usuario, se **reemplaza** el archivo; para `dataTreatmentSigned` y para los documentos del **paso 2** (`idFront`, `idBack`, `licenseFront`, `licenseBack`, `selfieWhiteBackground`) el estado pasa primero a **`PENDING`** y en la **misma petición** el servidor ejecuta la revisión con IA y devuelve el documento ya **`VALIDATED`** o **`REJECTED`** (con `validationMessage` si aplica).
- `POST /api/v1/users/:userId/documents/:documentId/data-treatment-ai-review` — opcional: repetir solo la revisión con IA sobre el PDF ya guardado (por ejemplo si quedó en `PENDING` o `REJECTED` y quieres reintentar sin volver a subir el archivo).
- `POST /api/v1/users/:userId/documents/:documentId/identity-ai-review` — igual que el anterior, para un archivo del paso 2 (cédula, licencia o selfie) ya guardado.
- `PATCH /api/v1/users/:userId/documents/:documentId/validation` — JSON `{ "validationStatus": "VALIDATED" | "REJECTED" | "PENDING" }` (para revisión desde backoffice; conviene proteger con auth en producción).
- `GET /api/v1/users/:userId/documents/:documentId/file` — sirve el archivo.
- `DELETE /api/v1/users/:userId/documents/:documentId` — elimina fila y archivo en disco.

En `.env` puedes ajustar: `UPLOAD_DIR`, `UPLOAD_MAX_BYTES` (por defecto 15MB), `UPLOAD_ALLOWED_MIMES` (lista separada por comas).

**Autorización de datos ya firmada (`documentKind=dataTreatmentSigned`):** solo se acepta **PDF**. Tras guardar el archivo, el servidor **en la misma petición** de subida ejecuta la revisión con **Google Gemini** y responde con **`VALIDATED`** o **`REJECTED`** (y `validationMessage` si falla). El endpoint `POST .../data-treatment-ai-review` sirve para **reintentar** la IA sin resubir el archivo. Configura `GEMINI_API_KEY` (ver `.env.example`). Si un modelo devuelve error o cuota agotada, el servidor prueba **varios modelos en cadena**; opcionalmente fija `GEMINI_MODEL` y/o `GEMINI_MODEL_FALLBACKS`. En desarrollo local puedes poner `DATA_TREATMENT_SKIP_AI_VERIFY=true` para que la IA siempre apruebe; en producción conviene exigir la clave. La IA no sustituye una revisión legal humana.

**Identificación (paso 2):** el **documento de identidad** puede ser **cédula de ciudadanía**, **cédula de extranjería** o **pasaporte** (`idFront` / `idBack`); además `licenseFront`, `licenseBack` y `selfieWhiteBackground`. Tras la subida, **Gemini** comprueba tipo y legibilidad; en **`licenseBack`** la IA exige ver la **categoría B2 vigente**. El endpoint `POST .../identity-ai-review` permite **reintentar** la revisión sin resubir el archivo. Misma configuración de API y de `DATA_TREATMENT_SKIP_AI_VERIFY` que el paso 1.

**Extracción estructurada (`UserIdentityExtraction`):** cuando un documento de identificación queda **`VALIDATED`**, el servidor intenta actualizar la tabla **`UserIdentityExtraction`** (una fila por `userId`): desde el **documento de identidad** (`idFront` y opcionalmente `idBack`) se rellenan nombres, apellidos, fecha de nacimiento y número o código de documento; cuando existen **frente y reverso del pase** (`licenseFront` + `licenseBack`), se evalúa si el titular **coincide con el documento de identidad** y se guarda la **fecha de vigencia** del pase (`licenseValidUntil`, formato `YYYY-MM-DD` cuando la IA puede inferirlo). Además se guarda **`identityPhotoDocumentId`** (referencia al `Document` del frente de identidad con la foto del titular) y, cuando hay selfie y frente validados, **`selfieMatchesIdentityPerson`** y **`selfieIsDistinctCaptureFromIdentity`** (misma persona que en el documento, y captura distinta a la foto del documento). La **selfie** solo se valida si el **frente del documento de identidad** ya está **`VALIDATED`**; se rechaza si no coincide o parece copia de la foto del documento. Si falta `GEMINI_API_KEY` o `DATA_TREATMENT_SKIP_AI_VERIFY=true`, no se ejecuta esta extracción (o la comparación selfie se omite según el código). Aplica las migraciones de Prisma (`npm run db:migrate` o `db:migrate:deploy`).

## Cambiar el modelo de datos

1. Edita `prisma/schema.prisma` (añade modelos o campos).
2. Ejecuta `npm run db:migrate` y pon un nombre descriptivo cuando Prisma lo pida.

Eso versiona los cambios de tablas. Para borrar tablas o columnas, quítalos del esquema y vuelve a migrar (en producción conviene planificar datos existentes).

Si solo quieres **sincronizar el esquema sin archivo de migración** (útil en prototipos rápidos):

```bash
npm run db:push
```

## Producción

```bash
npm run build
npm run db:migrate:deploy
npm start
```

`db:migrate:deploy` aplica migraciones ya generadas, sin modo interactivo.
