# DiabetesChain (Backend)

Backend de **DiabetesChain**, prototipo desarrollado en el contexto de tesis para la gestión segura de expedientes clínicos de pacientes con diabetes mediante un enfoque de soberanía del paciente sobre sus datos, control de acceso delegado, almacenamiento off-chain cifrado y trazabilidad on-chain.

El proyecto integra:

- **Express** como capa HTTP.
- **Hyperledger Fabric** para permisos, auditoría e índices clínicos.
- **MongoDB** para el repositorio de documentos clínicos cifrados.
- **SQLite + Sequelize** para identidad e infraestructura local.
- **Proxy Re-Encryption** para material criptográfico delegado.

**Autor:** Daniel Cabrera Reyes  
**Universidad:** Universidad Rafael Landivar

---

## Tabla de Contenido

1. [Consumo de Endpoints](#consumo-de-endpoints)
2. [Estructura del Proyecto](#estructura-del-proyecto)
3. [Flujos de Orquestación](#flujos-de-orquestación)
4. [Ejecución Local](#ejecución-local)

---

## Consumo de Endpoints

### Consideraciones Generales

- Base local sugerida: `http://localhost:3000`
- Los endpoints protegidos requieren `Authorization: Bearer <accessToken>`
- El token se obtiene en `POST /auth/login`
- Los roles usados por el backend son: `PATIENT`, `DOCTOR`, `LABORATORY`, `PHARMACIST`
- Las llaves públicas se exponen para permitir firma digital, cifrado y bootstrap criptográfico del cliente

### Encabezados Comunes

```http
Content-Type: application/json
Authorization: Bearer <accessToken>
```

### Bloques de Payload Reutilizables

#### Bloque de documento clínico cifrado

```json
{
  "scopeId": "general_consultation",
  "payloadMetadata": {
    "payloadFormat": "FHIR_JSON",
    "fhirResourceType": "Observation",
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

#### Bloque de grant de acceso

```json
{
  "professionalId": "uuid-del-profesional",
  "allowedScopes": [
    "8f4b8d0e-2d34-4cb3-b94d-7e4c8d1a31f2",
    "c91a0f5b-7e72-41df-a8f5-8c0d5b6f991a"
  ],
  "allowedActions": ["read", "write"],
  "validFrom": "2026-04-16T00:00:00.000Z",
  "validTo": "2026-05-16T00:00:00.000Z",
  "signature": "firma-base64",
  "kfrags": ["kfrag-1", "kfrag-2", "kfrag-3"]
}
```

---

### Endpoints Disponibles

| Método | Endpoint | Protegido | Rol requerido | Qué incluir |
| --- | --- | --- | --- | --- |
| `GET` | `/` | No | - | Sin payload |
| `GET` | `/health` | No | - | Sin payload |
| `POST` | `/auth/register` | No | - | Datos de usuario, credenciales y material criptográfico |
| `POST` | `/auth/login` | No | - | `email`, `password` |
| `GET` | `/auth/users/:id/public-key` | No | - | Parámetro `id` del profesional |
| `GET` | `/auth/patients/:pseudoId/public-key` | No | - | Parámetro `pseudoId` del paciente |
| `POST` | `/permissions/grants` | Si | `PATIENT` | Grant firmado, ventanas de validez, scopes, acciones, `kfrags` |
| `POST` | `/permissions/revocations` | Si | `PATIENT` | `professionalId`, `signature` |
| `GET` | `/clinical-records/history/me` | Si | `PATIENT` | Sin payload |
| `GET` | `/clinical-records/history/:patientPseudoId` | Si | `DOCTOR`, `LABORATORY`, `PHARMACIST` | Parámetro `patientPseudoId` |
| `GET` | `/scopes` | Si | Cualquier usuario autenticado | Sin payload |
| `POST` | `/clinical-records/events/doctor` | Si | `DOCTOR` | `patientPseudoId`, `signature`, `encounter`, opcional `labOrder`, opcional `prescription` |
| `POST` | `/clinical-records/events/laboratory` | Si | `LABORATORY` | `patientPseudoId`, `scopeId`, `basedOn`, `signature`, metadata de cifrado |
| `POST` | `/clinical-records/events/pharmacy` | Si | `PHARMACIST` | `patientPseudoId`, `scopeId`, `basedOn`, `signature`, metadata de cifrado |
| `GET` | `/audit/me` | Si | `PATIENT` | Sin payload |

<details>
<summary><strong>POST /auth/register</strong></summary>

**Descripción:** registra un usuario en el dominio de identidad.

**Payload requerido**

```json
{
  "username": "dcabrera",
  "email": "daniel@example.com",
  "password": "password-plano",
  "cuiHash": "hash-del-cui",
  "firstName": "Daniel",
  "middleName": "Fernando",
  "firstLastName": "Cabrera",
  "secondLastName": "Reyes",
  "role": "PATIENT",
  "professionalId": "solo-si-no-es-patient",
  "publicKey": "pem-public-key",
  "encryptedPrivateKeyByPassword": "base64",
  "passwordKdfSalt": "base64",
  "encryptedPrivateKeyByRecovery": "base64",
  "recoveryKdfSalt": "base64",
  "recoveryKeyHash": "hash"
}
```

**Notas**

- `professionalId` es obligatorio para `DOCTOR`, `LABORATORY` y `PHARMACIST`
- Si el rol es `PATIENT`, el backend genera `pseudoId`

</details>

<details>
<summary><strong>POST /auth/login</strong></summary>

**Payload requerido**

```json
{
  "email": "daniel@example.com",
  "password": "password-plano"
}
```

**Respuesta relevante**

- `accessToken`
- `tokenType`
- `expiresIn`
- `user`

</details>

<details>
<summary><strong>GET /auth/users/:id/public-key</strong></summary>

**Uso:** obtener la llave pública de un profesional.

**Incluir**

- Parámetro de ruta `id`

</details>

<details>
<summary><strong>GET /auth/patients/:pseudoId/public-key</strong></summary>

**Uso:** obtener la llave pública de un paciente.

**Incluir**

- Parámetro de ruta `pseudoId`

</details>

<details>
<summary><strong>POST /permissions/grants</strong></summary>

**Uso:** un paciente delega acceso a un profesional de salud.

**Payload requerido**

```json
{
  "professionalId": "uuid-profesional",
  "allowedScopes": [
    "8f4b8d0e-2d34-4cb3-b94d-7e4c8d1a31f2",
    "c91a0f5b-7e72-41df-a8f5-8c0d5b6f991a"
  ],
  "allowedActions": ["read", "write"],
  "validFrom": "2026-04-16T00:00:00.000Z",
  "validTo": "2026-05-16T00:00:00.000Z",
  "signature": "firma-base64",
  "kfrags": ["kfrag-1", "kfrag-2", "kfrag-3"]
}
```

</details>

<details>
<summary><strong>POST /permissions/revocations</strong></summary>

**Uso:** un paciente revoca un acceso previamente otorgado.

**Payload requerido**

```json
{
  "professionalId": "uuid-profesional",
  "signature": "firma-base64"
}
```

</details>

<details>
<summary><strong>GET /clinical-records/history/me</strong></summary>

**Uso:** un paciente recupera su propio historial.

**Incluir**

- Solo el token JWT del paciente

</details>

<details>
<summary><strong>GET /clinical-records/history/:patientPseudoId</strong></summary>

**Uso:** un profesional recupera el historial delegado de un paciente.

**Incluir**

- Parámetro de ruta `patientPseudoId`
- Token JWT de un `DOCTOR`, `LABORATORY` o `PHARMACIST`

</details>

<details>
<summary><strong>GET /scopes</strong></summary>

**Uso:** recuperar el catálogo off-chain de scopes clínicos disponibles para la UI.

**Incluir**

- Token JWT válido de cualquier usuario autenticado

**Respuesta relevante**

```json
[
  {
    "scopeId": "8f4b8d0e-2d34-4cb3-b94d-7e4c8d1a31f2",
    "label": "Control glucemico"
  }
]
```

</details>

<details>
<summary><strong>POST /clinical-records/events/doctor</strong></summary>

**Uso:** registrar una consulta médica y, opcionalmente, orden de laboratorio y receta.

**Payload requerido**

```json
{
  "patientPseudoId": "uuid-paciente",
  "signature": "firma-base64",
  "encounter": {
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

**Notas**

- `encounter` es obligatorio
- `labOrder` y `prescription` son opcionales

</details>

<details>
<summary><strong>POST /clinical-records/events/laboratory</strong></summary>

**Uso:** registrar un resultado de laboratorio basado en una orden previa.

**Payload requerido**

```json
{
  "patientPseudoId": "uuid-paciente",
  "scopeId": "c91a0f5b-7e72-41df-a8f5-8c0d5b6f991a",
  "basedOn": "recordId-de-lab-order",
  "signature": "firma-base64",
  "payloadMetadata": {
    "payloadFormat": "FHIR_JSON",
    "fhirResourceType": "Observation",
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

</details>

<details>
<summary><strong>POST /clinical-records/events/pharmacy</strong></summary>

**Uso:** registrar un despacho de farmacia basado en una receta previa.

**Payload requerido**

```json
{
  "patientPseudoId": "uuid-paciente",
  "scopeId": "40cb1d97-c0c0-4f41-8c5f-cb6ef2be52ef",
  "basedOn": "recordId-de-prescription",
  "signature": "firma-base64",
  "payloadMetadata": {
    "payloadFormat": "FHIR_JSON",
    "fhirResourceType": "MedicationDispense",
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

</details>

<details>
<summary><strong>GET /audit/me</strong></summary>

**Uso:** recuperar la línea de auditoría del paciente autenticado.

**Incluir**

- Solo el token JWT del paciente

</details>

---

## Estructura del Proyecto

La estructura sigue un enfoque por capas: rutas y controladores para HTTP, servicios de orquestación para los casos de uso, repositorios para acceso a persistencia y Fabric, y utilidades para validación, firma y normalización.

```text
diabeteschain-be/
|-- data/
|-- src/
|   |-- app.js
|   |-- server.js
|   |-- clients/
|   |   `-- proxyReencryption/
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
|   |   `-- orchestration/
|   `-- utils/
|-- tests/
|   |-- integration/
|   |-- setup/
|   `-- unit/
|-- index.js
|-- package.json
`-- jest.config.js
```

<details>
<summary><strong>src/</strong></summary>

| Carpeta / archivo | Función principal |
| --- | --- |
| `app.js` | Registra middleware, rutas y manejo global de errores |
| `server.js` | Arranque del servidor e inicialización de MongoDB, SQLite y Fabric |
| `clients/proxyReencryption/` | Cliente HTTP o adaptador hacia nodos de proxy re-encryption |
| `config/` | Conexiones y bootstrap de MongoDB, SQLite, seguridad y Fabric Gateway |
| `constants/` | Constantes del dominio, especialmente de auditoría |
| `controllers/` | Traducción de requests HTTP hacia servicios |
| `mappers/` | Normalización de respuestas del dominio clínico |
| `middlewares/` | Autenticación JWT, autorización por rol, validación DTO y errores |
| `models/api/` | DTOs de entrada para usuarios, permisos e historia clínica |
| `models/persistence/` | Esquemas de MongoDB y modelos Sequelize |
| `repositories/` | Acceso a MongoDB, SQLite/Fabric y encapsulación de consultas |
| `routes/` | Definición de endpoints por módulo |
| `services/identity/` | Lógica de registro, login y llaves públicas |
| `services/orchestration/` | Casos de uso complejos que coordinan varios repositorios |
| `utils/` | Firmas, JWT, permisos, normalización y manejo de errores |

</details>

<details>
<summary><strong>src/routes/</strong></summary>

- `identity.routes.js`: autenticación, registro y consulta de llaves públicas
- `permission.routes.js`: otorgamiento y revocación de accesos
- `clinicalRecord.routes.js`: historial clínico y registro de eventos
- `audit.routes.js`: auditoría visible para el paciente
- `health.js`: healthcheck del servicio
- `infrastructure.routes.js` y `scope.routes.js`: módulos reservados o en evolución

</details>

<details>
<summary><strong>src/services/orchestration/</strong></summary>

- `permission.orchestration.service.js`: coordina grants y revocations con identidad, Fabric y proxy re-encryption
- `clinicalRecord.orchestration.service.js`: coordina lectura de historia, validación de permisos y registro de eventos clínicos
- `audit.orchestration.service.js`: coordina la consulta de auditoría del paciente

</details>

<details>
<summary><strong>src/repositories/</strong></summary>

- `identity.repository.js`: usuarios, búsquedas por email, `id`, `pseudoId` y verificación de firma
- `clinicalRecord.repository.js`: documentos clínicos cifrados en MongoDB
- `fabricPermission.repository.js`: permisos activos, revocaciones y materiales de alcance en Fabric
- `fabricClinicalRecord.repository.js`: índices clínicos y eventos de auditoría en Fabric

</details>

<details>
<summary><strong>tests/</strong></summary>

- `integration/`: pruebas de rutas y flujos HTTP
- `unit/`: pruebas de utilidades, firmas y repositorios aislados
- `setup/`: inicialización común para pruebas

</details>

---

## Flujos de Orquestación

Esta sección resume los pasos que sigue cada caso de uso principal. La idea es mostrar la secuencia de llamadas y validaciones sin bajar a detalle de implementación.

### PermissionOrchestrationService

#### `grantAccess(payload, actor)`

1. Verifica que exista usuario autenticado y que su rol sea `PATIENT`.
2. Toma el `pseudoId` del paciente autenticado.
3. Recupera al paciente desde identidad.
4. Recupera al profesional destino por `professionalId`.
5. Valida que el destinatario sea `DOCTOR`, `LABORATORY` o `PHARMACIST`.
6. Valida fechas de vigencia, scopes y acciones permitidas.
7. Construye el payload canónico de firma del grant.
8. Verifica la firma con la llave pública del paciente.
9. Solicita nodos de proxy re-encryption segun la cantidad de `kfrags`.
10. Distribuye los `kfrags` a los nodos seleccionados con estado inicial `PENDING`.
11. Registra el permiso en Hyperledger Fabric.
12. Actualiza la distribución de `kfrags` a estado `ACTIVE`.
13. Devuelve el resultado del grant con la referencia del permiso creado.

#### `revokeAccess(payload, actor)`

1. Verifica autenticacion y rol `PATIENT`.
2. Obtiene el `pseudoId` del paciente autenticado.
3. Resuelve paciente y profesional desde el repositorio de identidad.
4. Verifica que el profesional tenga un rol clínico válido.
5. Construye el payload canónico de firma de revocación.
6. Verifica la firma con la llave pública del paciente.
7. Consulta en Fabric si existe un permiso activo entre paciente y profesional.
8. Revoca el permiso en Hyperledger Fabric.
9. Revoca o invalida la transformacion delegada en el servicio de proxy re-encryption.
10. Retorna el detalle de la revocacion y del permiso afectado.

### ClinicalRecordOrchestrationService

#### `getPatientHistory(payload, actor)`

1. Verifica autenticacion y rol `PATIENT`.
2. Obtiene el `pseudoId` desde el actor autenticado.
3. Confirma que el paciente exista en el dominio de identidad.
4. Recupera los índices clínicos del paciente desde Fabric.
5. Recupera los documentos clínicos cifrados desde MongoDB.
6. Relaciona referencias on-chain con documentos off-chain.
7. Devuelve el historial del paciente ya mapeado.

#### `getProfessionalHistory(payload, actor)`

1. Verifica autenticación y que el actor sea un profesional de salud válido.
2. Toma el `id` del profesional autenticado y el `patientPseudoId` solicitado.
3. Resuelve paciente y profesional desde identidad.
4. Consulta en Fabric los permisos activos entre paciente y profesional.
5. Filtra solo permisos activos con accion `read`.
6. Calcula los scopes efectivos autorizados.
7. Recupera en Fabric el material delegado asociado a esos permisos.
8. Filtra el material delegado segun scopes autorizados.
9. Recupera desde Fabric las referencias clínicas del paciente.
10. Filtra las referencias para conservar solo las permitidas por scope.
11. Recupera desde MongoDB los documentos clinicos correspondientes.
12. Mapea los registros con sus referencias de blockchain.
13. Solicita al cliente de proxy re-encryption el material de acceso delegado para el frontend.
14. Devuelve registros, permisos efectivos y material criptográfico delegado.

#### `registerDoctorConsultation(payload, actor)`

1. Construye el payload canónico de firma para toda la consulta.
2. Reune los scopes solicitados desde `encounter`, `labOrder` y `prescription`.
3. Resuelve el contexto compartido de registro clínico.
4. Registra el `encounter` como evento raiz.
5. Si existe `labOrder`, lo registra como evento hijo del encounter.
6. Si existe `prescription`, la registra como evento hijo del encounter.
7. Devuelve los registros creados en una sola respuesta.

#### `registerLaboratoryResult(payload, actor)`

1. Construye el payload canónico de firma del resultado de laboratorio.
2. Resuelve el contexto compartido de registro clínico para rol `LABORATORY`.
3. Busca el registro base indicado en `basedOn`.
4. Verifica que el registro base pertenezca al paciente y sea de tipo `LAB_ORDER`.
5. Recupera la referencia de blockchain asociada a la orden base.
6. Registra el nuevo resultado de laboratorio enlazado al `encounter` y a la orden previa.
7. Devuelve el registro creado.

#### `registerPharmacyDispatch(payload, actor)`

1. Construye el payload canónico de firma del despacho.
2. Resuelve el contexto compartido de registro clínico para rol `PHARMACIST`.
3. Busca el registro base indicado en `basedOn`.
4. Verifica que el registro base pertenezca al paciente y sea `MEDICAL_PRESCRIPTION`.
5. Recupera la referencia de blockchain asociada a la receta base.
6. Registra el despacho enlazado al `encounter` y a la receta previa.
7. Devuelve el registro creado.

#### `resolveClinicalRegistrationContext(...)`

1. Verifica autenticación del actor.
2. Valida que el rol autenticado coincida con el rol requerido por el caso de uso.
3. Valida presencia de `patientPseudoId` y `signature`.
4. Resuelve paciente y profesional desde identidad.
5. Verifica la firma del request con la llave pública del profesional.
6. Consulta en Fabric el permiso activo entre paciente y profesional.
7. Verifica que el permiso permita accion `write`.
8. Valida que los scopes solicitados estén autorizados.
9. Devuelve el contexto común para registrar eventos.

#### `resolveBaseClinicalRecord(...)`

1. Valida que exista el identificador `basedOn`.
2. Busca el registro base en MongoDB.
3. Verifica que el registro pertenezca al paciente.
4. Verifica que el tipo del registro coincida con el esperado.
5. Busca el índice clínico correspondiente en Fabric.
6. Verifica consistencia de tipo y estado en blockchain.
7. Devuelve el registro base y su referencia on-chain.

#### `registerClinicalRecordEvent(...)`

1. Resuelve o reutiliza el contexto validado de registro.
2. Verifica que exista el bloque de datos clínicos a persistir.
3. Valida el `scopeId` del evento contra el permiso activo.
4. Genera `recordId` y, si aplica, `encounterId`.
5. Construye el documento clínico cifrado para MongoDB.
6. Persiste el documento off-chain.
7. Construye el índice clínico para blockchain.
8. Registra el índice en Hyperledger Fabric.
9. Si falla el registro on-chain, intenta rollback del documento off-chain.
10. Retorna el documento y el índice resultante.

### AuditOrchestrationService

#### `getMyAuditEvents(actor)`

1. Verifica autenticación y rol `PATIENT`.
2. Obtiene el `pseudoId` del actor autenticado.
3. Confirma que el paciente exista en identidad.
4. Consulta en Fabric los eventos de auditoría del paciente.
5. Devuelve la línea de auditoría normalizada.

### IdentityService

Aunque no pertenece a `services/orchestration/`, forma parte del flujo funcional principal del backend.

#### `registerUser(userData)`

1. Valida que el rol solicitado sea permitido.
2. Si el usuario es paciente, genera `pseudoId`.
3. Si no es paciente, exige `professionalId`.
4. Verifica que el email no exista previamente.
5. Hashea la contraseña.
6. Resuelve el catálogo de rol y estado `ACTIVE`.
7. Construye el payload de persistencia.
8. Crea el usuario en la base de identidad.

#### `loginUser(credentials)`

1. Busca el usuario por email.
2. Compara la contraseña enviada con el hash almacenado.
3. Verifica que el usuario este `ACTIVE`.
4. Sanitiza el objeto de usuario.
5. Construye el payload del JWT.
6. Devuelve usuario autenticado y datos para generar el token.

#### `getProfessionalPublicKeyById(id)`

1. Valida que el `id` tenga formato UUID.
2. Busca el usuario por identificador interno.
3. Verifica que no sea paciente.
4. Devuelve la llave pública en formato de respuesta segura.

#### `getPatientPublicKeyByPseudoId(pseudoId)`

1. Valida que el `pseudoId` tenga formato UUID.
2. Busca el usuario por pseudoidentificador.
3. Verifica que sí sea paciente.
4. Devuelve la llave pública del paciente.

---

## Ejecución Local

### Scripts

```bash
npm install
npm run dev
npm test
```

### Secuencia de arranque del backend

1. Conecta a MongoDB.
2. Sincroniza la base de identidad.
3. Sincroniza la base de infraestructura.
4. Inicializa el Fabric Gateway.
5. Levanta el servidor Express.

### Variables de entorno esperadas

- `PORT`
- `MONGODB_URI`
- `JWT_SECRET`
- `JWT_EXPIRES_IN`
- `SCOPES_CATALOG_KEY`
- `FABRIC_CHANNEL`
- `FABRIC_CHAINCODE`
- `FABRIC_MSP_ID`
- `FABRIC_PEER_ENDPOINT`
- `FABRIC_PEER_HOST_ALIAS`
- `FABRIC_CRYPTO_BASE`
- `FABRIC_USER_MSP_PATH`
- `FABRIC_TLS_CERT_PATH`

`SCOPES_CATALOG_KEY` debe resolver a 32 bytes y puede declararse en base64, hex o texto plano de 32 bytes. Para generar una clave base64 de desarrollo puedes usar `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"`.

---

## Resumen Arquitectónico

DiabetesChain (Backend) implementa una separación clara entre identidad, permisos, auditoría e historia clínica. La información sensible se conserva cifrada fuera de la cadena, mientras que Hyperledger Fabric centraliza permisos, índices y trazabilidad. El backend actúa como capa de orquestación entre clientes, repositorios clínicos y componentes criptográficos, manteniendo el control del acceso centrado en el paciente.
