# DiabetesChain Backend

Backend de DiabetesChain, prototipo de tesis para la gestion segura de
expedientes clinicos de pacientes con diabetes. La solucion actual combina
identidad local, control de permisos centrado en el paciente, documentos
clinicos cifrados off-chain, trazabilidad en Hyperledger Fabric y Proxy
Re-Encryption (PRE) para delegar acceso criptografico por scope.

**Autor:** Daniel Cabrera Reyes  
**Universidad:** Universidad Rafael Landivar

---

## Tabla de Contenido

1. [Arquitectura Actual](#arquitectura-actual)
2. [Consumo de Endpoints](#consumo-de-endpoints)
3. [Contratos y Ledger](#contratos-y-ledger)
4. [Flujos Principales](#flujos-principales)
5. [Estructura del Proyecto](#estructura-del-proyecto)
6. [Ejecucion Local](#ejecucion-local)

---

## Arquitectura Actual

El backend esta organizado como una capa de orquestacion HTTP sobre cinco
componentes principales:

- **Express**: API REST, autenticacion JWT, autorizacion por rol y manejo de errores.
- **SQLite + Sequelize**: identidad local y datos de infraestructura.
- **MongoDB + Mongoose**: repositorio off-chain de documentos clinicos cifrados.
- **Hyperledger Fabric Gateway**: permisos, indices clinicos, ScopeMaterial y auditoria.
- **Servicio PRE externo**: registro, revocacion y transformacion de llaves por proxy.

La informacion clinica sensible se guarda cifrada en MongoDB. En Fabric se
registran indices, hashes, permisos, ScopeMaterial y eventos de auditoria. Los
labels del catalogo de scopes y las URLs de los nodos PRE se almacenan cifrados
en SQLite de infraestructura.

### Roles

Los roles usados por la API son:

- `PATIENT`
- `DOCTOR`
- `LABORATORY`
- `PHARMACIST`

Tambien existe `ADMIN` como catalogo de identidad, aunque los endpoints actuales
del dominio clinico no exponen operaciones administrativas.

---

## Consumo de Endpoints

Base local sugerida:

```text
http://localhost:3000
```

Los endpoints protegidos requieren:

```http
Authorization: Bearer <accessToken>
Content-Type: application/json
```

El token se obtiene con `POST /auth/login`.

### Endpoints Disponibles

| Metodo | Endpoint | Protegido | Rol requerido | Uso |
| --- | --- | --- | --- | --- |
| `GET` | `/` | No | - | Disponibilidad simple del backend |
| `GET` | `/health` | No | - | Healthcheck |
| `POST` | `/auth/register` | No | - | Registro de usuarios |
| `POST` | `/auth/login` | No | - | Login y emision de JWT |
| `GET` | `/auth/users/:username/public-key` | No | - | Llave publica de un profesional |
| `GET` | `/auth/patients/:username/public-key` | No | - | Llave publica de un paciente |
| `GET` | `/scopes` | Si | Cualquier usuario autenticado | Catalogo de scopes activos |
| `POST` | `/permissions/scope-materials/preflight` | Si | `PATIENT` | Verifica ScopeMaterial existente antes de otorgar acceso |
| `POST` | `/permissions/grants` | Si | `PATIENT` | Otorga acceso a un profesional |
| `POST` | `/permissions/revocations` | Si | `PATIENT` | Revoca un permiso activo |
| `GET` | `/clinical-records/history/me` | Si | `PATIENT` | Historial propio del paciente |
| `GET` | `/clinical-records/history/:patientUsername` | Si | `DOCTOR`, `LABORATORY`, `PHARMACIST` | Historial delegado, opcionalmente filtrado por scopes |
| `POST` | `/clinical-records/events/doctor` | Si | `DOCTOR` | Consulta medica, orden de laboratorio y/o receta |
| `POST` | `/clinical-records/events/laboratory` | Si | `LABORATORY` | Resultado de laboratorio |
| `POST` | `/clinical-records/events/pharmacy` | Si | `PHARMACIST` | Despacho de farmacia |
| `GET` | `/audit/me` | Si | `PATIENT` | Auditoria visible para el paciente |

### Bloques Reutilizables

#### Documento clinico cifrado

```json
{
  "scopeId": "8f4b8d0e-2d34-4cb3-b94d-7e4c8d1a31f2",
  "payloadMetadata": {
    "payloadFormat": "FHIR_JSON",
    "fhirResourceType": "Encounter",
    "contentType": "application/json"
  },
  "encryption": {
    "algorithm": "AES-256-GCM",
    "iv": "base64-iv",
    "authTag": "base64-auth-tag",
    "ciphertext": "base64-ciphertext"
  },
  "integrity": {
    "payloadHash": "sha256-hash"
  }
}
```

`payloadFormat`, `contentType` y `algorithm` tienen valores por defecto si no se
envian. `scopeId`, `payloadMetadata.fhirResourceType`, `encryption.iv`,
`encryption.authTag`, `encryption.ciphertext` e `integrity.payloadHash` son
obligatorios.

#### TransformKey para PRE

```json
{
  "scopeId": "8f4b8d0e-2d34-4cb3-b94d-7e4c8d1a31f2",
  "transformKey": "serialized-recrypt-transform-key",
  "transformKeyEncoding": "base64",
  "metadata": {
    "scheme": "RECRYPT"
  }
}
```

El cliente debe enviar una `transformKey` por cada scope autorizado. La API no
acepta `proxyNodeId` dentro de `transformKeys`; el backend selecciona los nodos
PRE activos desde la base de infraestructura.

#### ScopeMaterial inicial

```json
{
  "scopeId": "8f4b8d0e-2d34-4cb3-b94d-7e4c8d1a31f2",
  "encryptedScopeKey": "encrypted-k-scope",
  "encryptedScopeKeyEncoding": "base64",
  "recryptMetadata": {
    "scheme": "RECRYPT"
  },
  "metadata": {
    "source": "PATIENT_GRANT"
  }
}
```

`scopeMaterials` solo se requiere para scopes que aun no tienen material del
paciente registrado en Fabric. Para saber cuales faltan se usa el endpoint de
preflight.

### POST /auth/register

Registra un usuario en el dominio de identidad.

```json
{
  "username": "patient_user",
  "email": "patient@example.com",
  "password": "password-plano",
  "cuiHash": "hash-del-cui",
  "firstName": "Ana",
  "middleName": "Maria",
  "firstLastName": "Lopez",
  "secondLastName": "Garcia",
  "role": "PATIENT",
  "professionalId": "solo-para-profesionales",
  "publicKey": "pem-public-key",
  "encryptedPrivateKeyByPassword": "base64",
  "passwordKdfSalt": "base64",
  "encryptedPrivateKeyByRecovery": "base64",
  "recoveryKdfSalt": "base64",
  "recoveryKeyHash": "hash"
}
```

Para `DOCTOR`, `LABORATORY` y `PHARMACIST`, `professionalId` es obligatorio.
Para `PATIENT`, el backend genera `pseudoId`.

### POST /auth/login

```json
{
  "identifier": "patient@example.com",
  "password": "password-plano"
}
```

`identifier` acepta tanto el correo electrónico como el nombre de usuario.

Respuesta relevante:

```json
{
  "message": "Login successful",
  "tokenType": "Bearer",
  "accessToken": "<jwt>",
  "expiresIn": "1h",
  "user": {
    "id": "uuid",
    "pseudoId": "uuid-si-es-paciente",
    "username": "patient_user",
    "email": "patient@example.com",
    "role": "PATIENT",
    "professionalId": null,
    "status": "ACTIVE"
  }
}
```

### GET /auth/users/:username/public-key

Devuelve la llave publica de un usuario profesional. Si el username pertenece a
un paciente, responde como no encontrado.

### GET /auth/patients/:username/public-key

Devuelve la llave publica de un paciente. Si el username pertenece a un
profesional, responde como no encontrado.

### GET /scopes

Devuelve el catalogo activo de scopes. Los labels se descifran desde SQLite de
infraestructura.

```json
[
  {
    "scopeId": "8f4b8d0e-2d34-4cb3-b94d-7e4c8d1a31f2",
    "label": "Control glucemico"
  }
]
```

### POST /permissions/scope-materials/preflight

Permite que el frontend determine que scopes ya tienen `ScopeMaterial` del
paciente antes de crear un grant.

```json
{
  "scopeIds": [
    "8f4b8d0e-2d34-4cb3-b94d-7e4c8d1a31f2",
    "c91a0f5b-7e72-41df-a8f5-8c0d5b6f991a"
  ]
}
```

Tambien acepta `allowedScopes` o `scopes` como alias de `scopeIds`.

Respuesta relevante:

```json
{
  "success": true,
  "action": "scope_material_preflight",
  "requestedScopes": ["8f4b8d0e-2d34-4cb3-b94d-7e4c8d1a31f2"],
  "existingScopes": [],
  "missingScopes": ["8f4b8d0e-2d34-4cb3-b94d-7e4c8d1a31f2"],
  "scopeMaterials": [
    {
      "scopeId": "8f4b8d0e-2d34-4cb3-b94d-7e4c8d1a31f2",
      "exists": false
    }
  ]
}
```

### POST /permissions/grants

Otorga acceso de un paciente a un profesional. El payload puede enviarse plano o
dentro de `permission`; `transformKeys` y `scopeMaterials` se leen desde el
nivel raiz o desde `permission`.

```json
{
  "professionalUsername": "doctor_user",
  "allowedScopes": [
    "8f4b8d0e-2d34-4cb3-b94d-7e4c8d1a31f2"
  ],
  "allowedActions": ["read", "write"],
  "validFrom": "2026-04-16T00:00:00.000Z",
  "validTo": "2026-05-16T00:00:00.000Z",
  "signature": "firma-base64",
  "transformKeys": [
    {
      "scopeId": "8f4b8d0e-2d34-4cb3-b94d-7e4c8d1a31f2",
      "transformKey": "serialized-recrypt-transform-key",
      "transformKeyEncoding": "base64",
      "metadata": {
        "scheme": "RECRYPT"
      }
    }
  ],
  "scopeMaterials": [
    {
      "scopeId": "8f4b8d0e-2d34-4cb3-b94d-7e4c8d1a31f2",
      "encryptedScopeKey": "encrypted-k-scope",
      "encryptedScopeKeyEncoding": "base64",
      "metadata": {
        "source": "PATIENT_GRANT"
      }
    }
  ]
}
```

Tambien se puede usar `granteeId` en lugar de `professionalUsername`.
`allowedActions` acepta `read` y `write`. El backend valida que los scopes esten
activos en el catalogo, verifica la firma del paciente, crea el permiso en
Fabric, crea los ScopeMaterial faltantes y registra las transform keys en los
nodos PRE seleccionados.

Payload canonico que firma el paciente:

```json
{
  "action": "GRANT_ACCESS",
  "patientUsername": "patient_user",
  "professionalUsername": "doctor_user",
  "allowedActions": ["read", "write"],
  "allowedScopes": ["8f4b8d0e-2d34-4cb3-b94d-7e4c8d1a31f2"],
  "validFrom": "2026-04-16T00:00:00.000Z",
  "validTo": "2026-05-16T00:00:00.000Z"
}
```

### POST /permissions/revocations

Revoca un permiso activo. Se puede resolver por `permissionId` o por la pareja
paciente-profesional.

```json
{
  "permissionId": "permission-id-opcional",
  "professionalUsername": "doctor_user",
  "signature": "firma-base64-opcional"
}
```

Tambien acepta `granteeId`. Si se envia `signature`, se verifica contra el
payload canonico:

```json
{
  "action": "REVOKE_ACCESS",
  "patientUsername": "patient_user",
  "professionalUsername": "doctor_user"
}
```

El backend revoca el permiso en Fabric y luego desactiva las transform keys en
los nodos PRE asociados a los scopes del permiso.

### GET /clinical-records/history/me

Devuelve el historial del paciente autenticado. Consulta indices en Fabric,
recupera documentos cifrados desde MongoDB y adjunta ScopeMaterial disponible
por scope.

### GET /clinical-records/history/:patientUsername

Devuelve el historial delegado para un profesional autorizado. Puede filtrarse
por query string:

```text
/clinical-records/history/patient_user?scopeIds=8f4b8d0e-2d34-4cb3-b94d-7e4c8d1a31f2,c91a0f5b-7e72-41df-a8f5-8c0d5b6f991a
```

Tambien acepta `scopes` como alias. El backend valida permisos activos de
lectura, registra auditoria de lectura en Fabric, filtra referencias por scope,
recupera documentos cifrados y solicita al servicio PRE la transformacion de la
llave de cada scope autorizado.

### POST /clinical-records/events/doctor

Registra una consulta medica. `encounter` es obligatorio; `labOrder` y
`prescription` son opcionales.

```json
{
  "patientUsername": "patient_user",
  "signature": "firma-base64",
  "encounter": {
    "scopeId": "8f4b8d0e-2d34-4cb3-b94d-7e4c8d1a31f2",
    "payloadMetadata": {
      "fhirResourceType": "Encounter"
    },
    "encryption": {
      "iv": "base64-iv",
      "authTag": "base64-auth-tag",
      "ciphertext": "base64-ciphertext"
    },
    "integrity": {
      "payloadHash": "sha256-hash"
    }
  },
  "labOrder": {
    "scopeId": "c91a0f5b-7e72-41df-a8f5-8c0d5b6f991a",
    "payloadMetadata": {
      "fhirResourceType": "ServiceRequest"
    },
    "encryption": {
      "iv": "base64-iv",
      "authTag": "base64-auth-tag",
      "ciphertext": "base64-ciphertext"
    },
    "integrity": {
      "payloadHash": "sha256-hash"
    }
  },
  "prescription": {
    "scopeId": "40cb1d97-c0c0-4f41-8c5f-cb6ef2be52ef",
    "payloadMetadata": {
      "fhirResourceType": "MedicationRequest"
    },
    "encryption": {
      "iv": "base64-iv",
      "authTag": "base64-auth-tag",
      "ciphertext": "base64-ciphertext"
    },
    "integrity": {
      "payloadHash": "sha256-hash"
    }
  }
}
```

La firma se valida con la llave publica del doctor. El profesional debe tener
permiso activo con accion `write` para todos los scopes solicitados.

### POST /clinical-records/events/laboratory

Registra un resultado de laboratorio basado en una orden previa.

```json
{
  "patientUsername": "patient_user",
  "scopeId": "c91a0f5b-7e72-41df-a8f5-8c0d5b6f991a",
  "basedOn": "record-id-de-lab-order",
  "signature": "firma-base64",
  "payloadMetadata": {
    "fhirResourceType": "Observation"
  },
  "encryption": {
    "iv": "base64-iv",
    "authTag": "base64-auth-tag",
    "ciphertext": "base64-ciphertext"
  },
  "integrity": {
    "payloadHash": "sha256-hash"
  }
}
```

`basedOn` debe apuntar a un registro `LAB_ORDER` del paciente.

### POST /clinical-records/events/pharmacy

Registra un despacho de farmacia basado en una receta previa.

```json
{
  "patientUsername": "patient_user",
  "scopeId": "40cb1d97-c0c0-4f41-8c5f-cb6ef2be52ef",
  "basedOn": "record-id-de-prescription",
  "signature": "firma-base64",
  "payloadMetadata": {
    "fhirResourceType": "MedicationDispense"
  },
  "encryption": {
    "iv": "base64-iv",
    "authTag": "base64-auth-tag",
    "ciphertext": "base64-ciphertext"
  },
  "integrity": {
    "payloadHash": "sha256-hash"
  }
}
```

`basedOn` debe apuntar a un registro `MEDICAL_PRESCRIPTION` del paciente.

### GET /audit/me

Devuelve la linea de auditoria del paciente autenticado normalizada desde
Fabric.

---

## Contratos y Ledger

El backend usa un unico contrato resuelto por `FABRIC_CHANNEL` y
`FABRIC_CHAINCODE`. Las funciones de chaincode esperadas por la solucion actual
son:

| Funcion Fabric | Uso desde backend |
| --- | --- |
| `CreatePermissionWithAudit` | Crear permiso paciente-profesional con auditoria |
| `RevokePermissionWithAudit` | Revocar permiso con auditoria |
| `GetPermissionById` | Consultar permiso por identificador |
| `GetActivePermissionByPatientAndGrantee` | Obtener permisos activos entre paciente y profesional |
| `GetHistoryByPatientPseudoId` | Leer indices clinicos del paciente sin auditoria profesional |
| `GetHistoryByPatientPseudoIdWithAudit` | Leer indices como profesional y registrar auditoria |
| `RegisterClinicalRecordWithAudit` | Registrar indice clinico y evento de auditoria |
| `GetAuditEventsByPatientPseudoId` | Consultar auditoria visible para paciente |
| `CreateScopeMaterial` | Crear material criptografico persistente por paciente y scope |
| `GetScopeMaterialByPatientAndScope` | Consultar ScopeMaterial activo de un scope |
| `GetScopeMaterialsByPatientAndScopes` | Consultar ScopeMaterials activos de varios scopes |

Los indices clinicos enviados a Fabric incluyen `recordId`, `patientPseudoId`,
`encounterId`, `scopeId`, `recordType`, `offchainUri`, `hash`, `createdAt`,
`createdBy`, `authorRole`, `status`, `auditId` y `timestamp`.

Los tipos clinicos persistidos por el backend son:

- `ENCOUNTER`
- `LAB_ORDER`
- `LAB_RESULT`
- `MEDICAL_PRESCRIPTION`
- `PHARMACY_DISPATCH`

---

## Flujos Principales

### Registro e inicio de sesion

1. `POST /auth/register` valida el DTO, crea usuario en SQLite y hashea password.
2. Los pacientes reciben `pseudoId`; los profesionales requieren `professionalId`.
3. `POST /auth/login` valida credenciales, estado `ACTIVE` y emite JWT HS256.
4. Las rutas protegidas resuelven `req.user` desde `Authorization: Bearer`.

### Otorgamiento de acceso

1. El paciente consulta `/scopes` para elegir scopes activos.
2. El paciente ejecuta `/permissions/scope-materials/preflight`.
3. El frontend genera `encryptedScopeKey` solo para scopes faltantes.
4. El frontend genera una `transformKey` por scope autorizado.
5. El paciente firma el payload canonico `GRANT_ACCESS`.
6. El backend valida rol, identidad, scopes, acciones, fechas y firma.
7. El backend selecciona nodos PRE activos desde SQLite de infraestructura.
8. El backend crea ScopeMaterial faltante en Fabric.
9. El backend crea el permiso en Fabric con `CreatePermissionWithAudit`.
10. El backend registra las transform keys en cada nodo PRE seleccionado.

### Lectura delegada por profesional

1. El profesional solicita `/clinical-records/history/:patientUsername`.
2. El backend valida rol profesional, paciente destino y permisos activos.
3. Se conservan solo permisos activos con accion `read`.
4. Se filtran scopes contra el catalogo activo y contra el query opcional.
5. Se lee el historial con auditoria mediante `GetHistoryByPatientPseudoIdWithAudit`.
6. Se recuperan documentos cifrados desde MongoDB.
7. Se resuelve ScopeMaterial por scope.
8. El backend solicita al servicio PRE transformar la llave de scope.
9. La respuesta agrupa registros y material transformado por scope.

### Escritura clinica por profesional

1. El profesional firma el payload canonico del evento.
2. El backend valida rol, identidad, firma, permiso activo con accion `write` y scopes autorizados.
3. El backend exige que exista ScopeMaterial activo del paciente para cada scope.
4. El documento clinico cifrado se guarda en MongoDB.
5. El indice clinico se registra en Fabric con `RegisterClinicalRecordWithAudit`.
6. Si falla el registro on-chain, el backend intenta eliminar el documento off-chain creado.

### Revocacion

1. El paciente solicita `/permissions/revocations`.
2. El backend resuelve el permiso activo por `permissionId` o paciente-profesional.
3. Si hay firma, se valida el payload canonico `REVOKE_ACCESS`.
4. Se revoca el permiso en Fabric con `RevokePermissionWithAudit`.
5. Se revocan las transform keys en los nodos PRE asociados a los scopes del permiso.

---

## Estructura del Proyecto

```text
diabeteschain-be/
|-- data/
|-- src/
|   |-- app.js
|   |-- server.js
|   |-- clients/
|   |   `-- preServiceClient.js
|   |-- config/
|   |-- constants/
|   |-- controllers/
|   |-- mappers/
|   |-- middlewares/
|   |-- models/
|   |   |-- api/
|   |   `-- persistence/
|   |-- repositories/
|   |-- routes/
|   |-- services/
|   |   |-- identity/
|   |   |-- infrastructure/
|   |   `-- orchestration/
|   `-- utils/
|-- tests/
|   |-- integration/
|   |-- setup/
|   `-- unit/
|-- index.js
|-- jest.config.js
|-- package.json
`-- README.md
```

### Capas principales

| Ruta | Funcion |
| --- | --- |
| `src/app.js` | Middleware global, rutas y fallback 404 |
| `src/server.js` | Arranque: MongoDB, SQLite de identidad, SQLite de infraestructura y Fabric Gateway |
| `src/routes/` | Definicion de endpoints por modulo |
| `src/controllers/` | Adaptacion HTTP hacia servicios |
| `src/models/api/` | DTOs y validacion de payloads |
| `src/models/persistence/` | Modelos Sequelize y Mongoose |
| `src/repositories/` | Acceso a SQLite, MongoDB y Fabric |
| `src/services/identity/` | Registro, login y llaves publicas |
| `src/services/infrastructure/` | Catalogo de scopes y nodos PRE |
| `src/services/orchestration/` | Casos de uso de permisos, historia clinica y auditoria |
| `src/clients/preServiceClient.js` | Cliente HTTP hacia nodos PRE |
| `src/utils/` | Firmas canonicas, JWT, normalizacion y criptografia auxiliar |

---

## Ejecucion Local

### Scripts

```bash
npm install
npm run dev
npm start
npm test
```

`npm run dev` ejecuta `nodemon src/server.js`. `npm start` ejecuta `node index.js`.

### Secuencia de arranque

1. Carga variables con `dotenv`.
2. Conecta a MongoDB usando `MONGODB_URI`.
3. Sincroniza SQLite de identidad y siembra roles/estados.
4. Sincroniza SQLite de infraestructura y siembra catalogo de scopes/nodos PRE.
5. Inicializa Fabric Gateway.
6. Levanta Express en `PORT` o `3000`.

### Variables de entorno

```env
PORT=3000
MONGODB_URI=mongodb://localhost:27017

JWT_ACCESS_SECRET=change-me
JWT_ACCESS_EXPIRES_IN=1h
JWT_ISSUER=diabeteschain-be
ALLOW_DEV_IDENTITY_HEADERS=false
REQUEST_LOGGER_ENABLED=true

IDENTITY_DB_STORAGE=./data/Identity.sqlite
INFRASTRUCTURE_DB_STORAGE=./data/Infrastructure.sqlite
SCOPES_CATALOG_KEY=base64-32-bytes
INFRASTRUCTURE_SECRET_KEY=base64-32-bytes

PRE_SERVICE_API_KEY=optional
PRE_SERVICE_TIMEOUT_MS=5000

FABRIC_CHANNEL=mychannel
FABRIC_CHAINCODE=diabeteschain
FABRIC_MSP_ID=Org1MSP
FABRIC_PEER_ENDPOINT=localhost:7051
FABRIC_PEER_HOST_ALIAS=peer0.org1.example.com
FABRIC_CRYPTO_BASE=/path/to/crypto-material
FABRIC_USER_MSP_PATH=/path/to/users/User1@org1.example.com/msp
FABRIC_TLS_CERT_PATH=/path/to/peer/tls/ca.crt
```

`JWT_ACCESS_SECRET` es obligatorio al cargar la configuracion de seguridad.
`SCOPES_CATALOG_KEY` e `INFRASTRUCTURE_SECRET_KEY` deben resolver exactamente a
32 bytes; pueden estar en base64, hex o texto plano de 32 bytes.

Para generar claves base64 de desarrollo:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

### Datos sembrados automaticamente

En identidad:

- Roles: `PATIENT`, `DOCTOR`, `LABORATORY`, `PHARMACIST`, `ADMIN`
- Estados: `ACTIVE`, `INACTIVE`, `SUSPENDED`

En infraestructura:

- Catalogo de scopes clinicos del prototipo de diabetes.
- Nodo PRE local por defecto: `http://localhost:4100`.

### Servicio PRE esperado

Cada nodo PRE debe exponer:

| Metodo | Ruta | Uso |
| --- | --- | --- |
| `POST` | `/transform-keys` | Registrar transform key para un permiso/scope |
| `POST` | `/transform-keys/revoke` | Revocar transform key |
| `POST` | `/transform` | Transformar `encryptedScopeKey` para el profesional autorizado |
