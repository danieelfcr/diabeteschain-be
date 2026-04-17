# DiabetesChain (Backend)

Backend de **DiabetesChain**, prototipo desarrollado en el contexto de tesis para la gestion segura de expedientes clinicos de pacientes con diabetes mediante un enfoque de soberania del paciente sobre sus datos, control de acceso delegado, almacenamiento off-chain cifrado y trazabilidad on-chain.

El proyecto integra:

- **Express** como capa HTTP.
- **Hyperledger Fabric** para permisos, auditoria e indices clinicos.
- **MongoDB** para el repositorio de documentos clinicos cifrados.
- **SQLite + Sequelize** para identidad e infraestructura local.
- **Proxy Re-Encryption** para material criptografico delegado.

**Autor:** Daniel Cabrera Reyes  
**Universidad:** Universidad Rafael Landivar

---

## Tabla de Contenido

1. [Consumo de Endpoints](#consumo-de-endpoints)
2. [Estructura del Proyecto](#estructura-del-proyecto)
3. [Flujos de Orquestacion](#flujos-de-orquestacion)
4. [Ejecucion Local](#ejecucion-local)

---

## Consumo de Endpoints

### Consideraciones Generales

- Base local sugerida: `http://localhost:3000`
- Los endpoints protegidos requieren `Authorization: Bearer <accessToken>`
- El token se obtiene en `POST /auth/login`
- Los roles usados por el backend son: `PATIENT`, `DOCTOR`, `LABORATORY`, `PHARMACIST`
- Las llaves publicas se exponen para permitir firma digital, cifrado y bootstrap criptografico del cliente

### Encabezados Comunes

```http
Content-Type: application/json
Authorization: Bearer <accessToken>
```

### Bloques de Payload Reutilizables

#### Bloque de documento clinico cifrado

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
  "allowedScopes": ["general_consultation", "laboratory"],
  "allowedActions": ["read", "write"],
  "validFrom": "2026-04-16T00:00:00.000Z",
  "validTo": "2026-05-16T00:00:00.000Z",
  "signature": "firma-base64",
  "kfrags": ["kfrag-1", "kfrag-2", "kfrag-3"]
}
```

---

### Endpoints Disponibles

| Metodo | Endpoint | Protegido | Rol requerido | Que incluir |
| --- | --- | --- | --- | --- |
| `GET` | `/` | No | - | Sin payload |
| `GET` | `/health` | No | - | Sin payload |
| `POST` | `/auth/register` | No | - | Datos de usuario, credenciales y material criptografico |
| `POST` | `/auth/login` | No | - | `email`, `password` |
| `GET` | `/auth/users/:id/public-key` | No | - | Parametro `id` del profesional |
| `GET` | `/auth/patients/:pseudoId/public-key` | No | - | Parametro `pseudoId` del paciente |
| `POST` | `/permissions/grants` | Si | `PATIENT` | Grant firmado, ventanas de validez, scopes, acciones, `kfrags` |
| `POST` | `/permissions/revocations` | Si | `PATIENT` | `professionalId`, `signature` |
| `GET` | `/clinical-records/history/me` | Si | `PATIENT` | Sin payload |
| `GET` | `/clinical-records/history/:patientPseudoId` | Si | `DOCTOR`, `LABORATORY`, `PHARMACIST` | Parametro `patientPseudoId` |
| `POST` | `/clinical-records/events/doctor` | Si | `DOCTOR` | `patientPseudoId`, `signature`, `encounter`, opcional `labOrder`, opcional `prescription` |
| `POST` | `/clinical-records/events/laboratory` | Si | `LABORATORY` | `patientPseudoId`, `scopeId`, `basedOn`, `signature`, metadata de cifrado |
| `POST` | `/clinical-records/events/pharmacy` | Si | `PHARMACIST` | `patientPseudoId`, `scopeId`, `basedOn`, `signature`, metadata de cifrado |
| `GET` | `/audit/me` | Si | `PATIENT` | Sin payload |

<details>
<summary><strong>POST /auth/register</strong></summary>

**Descripcion:** registra un usuario en el dominio de identidad.

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

**Uso:** obtener la llave publica de un profesional.

**Incluir**

- Parametro de ruta `id`

</details>

<details>
<summary><strong>GET /auth/patients/:pseudoId/public-key</strong></summary>

**Uso:** obtener la llave publica de un paciente.

**Incluir**

- Parametro de ruta `pseudoId`

</details>

<details>
<summary><strong>POST /permissions/grants</strong></summary>

**Uso:** un paciente delega acceso a un profesional de salud.

**Payload requerido**

```json
{
  "professionalId": "uuid-profesional",
  "allowedScopes": ["general_consultation", "laboratory"],
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

- Parametro de ruta `patientPseudoId`
- Token JWT de un `DOCTOR`, `LABORATORY` o `PHARMACIST`

</details>

<details>
<summary><strong>POST /clinical-records/events/doctor</strong></summary>

**Uso:** registrar una consulta medica y, opcionalmente, orden de laboratorio y receta.

**Payload requerido**

```json
{
  "patientPseudoId": "uuid-paciente",
  "signature": "firma-base64",
  "encounter": {
    "scopeId": "general_consultation",
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
    "scopeId": "laboratory",
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
    "scopeId": "pharmacy",
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
  "scopeId": "laboratory",
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
  "scopeId": "pharmacy",
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

**Uso:** recuperar la linea de auditoria del paciente autenticado.

**Incluir**

- Solo el token JWT del paciente

</details>

---

## Estructura del Proyecto

La estructura sigue un enfoque por capas: rutas y controladores para HTTP, servicios de orquestacion para los casos de uso, repositorios para acceso a persistencia y Fabric, y utilidades para validacion, firma y normalizacion.

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

| Carpeta / archivo | Funcion principal |
| --- | --- |
| `app.js` | Registra middleware, rutas y manejo global de errores |
| `server.js` | Arranque del servidor e inicializacion de MongoDB, SQLite y Fabric |
| `clients/proxyReencryption/` | Cliente HTTP o adaptador hacia nodos de proxy re-encryption |
| `config/` | Conexiones y bootstrap de MongoDB, SQLite, seguridad y Fabric Gateway |
| `constants/` | Constantes del dominio, especialmente de auditoria |
| `controllers/` | Traduccion de requests HTTP hacia servicios |
| `mappers/` | Normalizacion de respuestas del dominio clinico |
| `middlewares/` | Autenticacion JWT, autorizacion por rol, validacion DTO y errores |
| `models/api/` | DTOs de entrada para usuarios, permisos e historia clinica |
| `models/persistence/` | Esquemas de MongoDB y modelos Sequelize |
| `repositories/` | Acceso a MongoDB, SQLite/Fabric y encapsulacion de consultas |
| `routes/` | Definicion de endpoints por modulo |
| `services/identity/` | Logica de registro, login y llaves publicas |
| `services/orchestration/` | Casos de uso complejos que coordinan varios repositorios |
| `utils/` | Firmas, JWT, permisos, normalizacion y manejo de errores |

</details>

<details>
<summary><strong>src/routes/</strong></summary>

- `identity.routes.js`: autenticacion, registro y consulta de llaves publicas
- `permission.routes.js`: otorgamiento y revocacion de accesos
- `clinicalRecord.routes.js`: historial clinico y registro de eventos
- `audit.routes.js`: auditoria visible para el paciente
- `health.js`: healthcheck del servicio
- `infrastructure.routes.js` y `scope.routes.js`: modulos reservados o en evolucion

</details>

<details>
<summary><strong>src/services/orchestration/</strong></summary>

- `permission.orchestration.service.js`: coordina grants y revocations con identidad, Fabric y proxy re-encryption
- `clinicalRecord.orchestration.service.js`: coordina lectura de historia, validacion de permisos y registro de eventos clinicos
- `audit.orchestration.service.js`: coordina la consulta de auditoria del paciente

</details>

<details>
<summary><strong>src/repositories/</strong></summary>

- `identity.repository.js`: usuarios, busquedas por email, `id`, `pseudoId` y verificacion de firma
- `clinicalRecord.repository.js`: documentos clinicos cifrados en MongoDB
- `fabricPermission.repository.js`: permisos activos, revocaciones y materiales de alcance en Fabric
- `fabricClinicalRecord.repository.js`: indices clinicos y eventos de auditoria en Fabric

</details>

<details>
<summary><strong>tests/</strong></summary>

- `integration/`: pruebas de rutas y flujos HTTP
- `unit/`: pruebas de utilidades, firmas y repositorios aislados
- `setup/`: inicializacion comun para pruebas

</details>

---

## Flujos de Orquestacion

Esta seccion resume los pasos que sigue cada caso de uso principal. La idea es mostrar la secuencia de llamadas y validaciones sin bajar a detalle de implementacion.

### PermissionOrchestrationService

#### `grantAccess(payload, actor)`

1. Verifica que exista usuario autenticado y que su rol sea `PATIENT`.
2. Toma el `pseudoId` del paciente autenticado.
3. Recupera al paciente desde identidad.
4. Recupera al profesional destino por `professionalId`.
5. Valida que el destinatario sea `DOCTOR`, `LABORATORY` o `PHARMACIST`.
6. Valida fechas de vigencia, scopes y acciones permitidas.
7. Construye el payload canonico de firma del grant.
8. Verifica la firma con la llave publica del paciente.
9. Solicita nodos de proxy re-encryption segun la cantidad de `kfrags`.
10. Distribuye los `kfrags` a los nodos seleccionados con estado inicial `PENDING`.
11. Registra el permiso en Hyperledger Fabric.
12. Actualiza la distribucion de `kfrags` a estado `ACTIVE`.
13. Devuelve el resultado del grant con la referencia del permiso creado.

#### `revokeAccess(payload, actor)`

1. Verifica autenticacion y rol `PATIENT`.
2. Obtiene el `pseudoId` del paciente autenticado.
3. Resuelve paciente y profesional desde el repositorio de identidad.
4. Verifica que el profesional tenga un rol clinico valido.
5. Construye el payload canonico de firma de revocacion.
6. Verifica la firma con la llave publica del paciente.
7. Consulta en Fabric si existe un permiso activo entre paciente y profesional.
8. Revoca el permiso en Hyperledger Fabric.
9. Revoca o invalida la transformacion delegada en el servicio de proxy re-encryption.
10. Retorna el detalle de la revocacion y del permiso afectado.

### ClinicalRecordOrchestrationService

#### `getPatientHistory(payload, actor)`

1. Verifica autenticacion y rol `PATIENT`.
2. Obtiene el `pseudoId` desde el actor autenticado.
3. Confirma que el paciente exista en el dominio de identidad.
4. Recupera los indices clinicos del paciente desde Fabric.
5. Recupera los documentos clinicos cifrados desde MongoDB.
6. Relaciona referencias on-chain con documentos off-chain.
7. Devuelve el historial del paciente ya mapeado.

#### `getProfessionalHistory(payload, actor)`

1. Verifica autenticacion y que el actor sea un profesional de salud valido.
2. Toma el `id` del profesional autenticado y el `patientPseudoId` solicitado.
3. Resuelve paciente y profesional desde identidad.
4. Consulta en Fabric los permisos activos entre paciente y profesional.
5. Filtra solo permisos activos con accion `read`.
6. Calcula los scopes efectivos autorizados.
7. Recupera en Fabric el material delegado asociado a esos permisos.
8. Filtra el material delegado segun scopes autorizados.
9. Recupera desde Fabric las referencias clinicas del paciente.
10. Filtra las referencias para conservar solo las permitidas por scope.
11. Recupera desde MongoDB los documentos clinicos correspondientes.
12. Mapea los registros con sus referencias de blockchain.
13. Solicita al cliente de proxy re-encryption el material de acceso delegado para el frontend.
14. Devuelve registros, permisos efectivos y material criptografico delegado.

#### `registerDoctorConsultation(payload, actor)`

1. Construye el payload canonico de firma para toda la consulta.
2. Reune los scopes solicitados desde `encounter`, `labOrder` y `prescription`.
3. Resuelve el contexto compartido de registro clinico.
4. Registra el `encounter` como evento raiz.
5. Si existe `labOrder`, lo registra como evento hijo del encounter.
6. Si existe `prescription`, la registra como evento hijo del encounter.
7. Devuelve los registros creados en una sola respuesta.

#### `registerLaboratoryResult(payload, actor)`

1. Construye el payload canonico de firma del resultado de laboratorio.
2. Resuelve el contexto compartido de registro clinico para rol `LABORATORY`.
3. Busca el registro base indicado en `basedOn`.
4. Verifica que el registro base pertenezca al paciente y sea de tipo `LAB_ORDER`.
5. Recupera la referencia de blockchain asociada a la orden base.
6. Registra el nuevo resultado de laboratorio enlazado al `encounter` y a la orden previa.
7. Devuelve el registro creado.

#### `registerPharmacyDispatch(payload, actor)`

1. Construye el payload canonico de firma del despacho.
2. Resuelve el contexto compartido de registro clinico para rol `PHARMACIST`.
3. Busca el registro base indicado en `basedOn`.
4. Verifica que el registro base pertenezca al paciente y sea `MEDICAL_PRESCRIPTION`.
5. Recupera la referencia de blockchain asociada a la receta base.
6. Registra el despacho enlazado al `encounter` y a la receta previa.
7. Devuelve el registro creado.

#### `resolveClinicalRegistrationContext(...)`

1. Verifica autenticacion del actor.
2. Valida que el rol autenticado coincida con el rol requerido por el caso de uso.
3. Valida presencia de `patientPseudoId` y `signature`.
4. Resuelve paciente y profesional desde identidad.
5. Verifica la firma del request con la llave publica del profesional.
6. Consulta en Fabric el permiso activo entre paciente y profesional.
7. Verifica que el permiso permita accion `write`.
8. Valida que los scopes solicitados esten autorizados.
9. Devuelve el contexto comun para registrar eventos.

#### `resolveBaseClinicalRecord(...)`

1. Valida que exista el identificador `basedOn`.
2. Busca el registro base en MongoDB.
3. Verifica que el registro pertenezca al paciente.
4. Verifica que el tipo del registro coincida con el esperado.
5. Busca el indice clinico correspondiente en Fabric.
6. Verifica consistencia de tipo y estado en blockchain.
7. Devuelve el registro base y su referencia on-chain.

#### `registerClinicalRecordEvent(...)`

1. Resuelve o reutiliza el contexto validado de registro.
2. Verifica que exista el bloque de datos clinicos a persistir.
3. Valida el `scopeId` del evento contra el permiso activo.
4. Genera `recordId` y, si aplica, `encounterId`.
5. Construye el documento clinico cifrado para MongoDB.
6. Persiste el documento off-chain.
7. Construye el indice clinico para blockchain.
8. Registra el indice en Hyperledger Fabric.
9. Si falla el registro on-chain, intenta rollback del documento off-chain.
10. Retorna el documento y el indice resultante.

### AuditOrchestrationService

#### `getMyAuditEvents(actor)`

1. Verifica autenticacion y rol `PATIENT`.
2. Obtiene el `pseudoId` del actor autenticado.
3. Confirma que el paciente exista en identidad.
4. Consulta en Fabric los eventos de auditoria del paciente.
5. Devuelve la linea de auditoria normalizada.

### IdentityService

Aunque no pertenece a `services/orchestration/`, forma parte del flujo funcional principal del backend.

#### `registerUser(userData)`

1. Valida que el rol solicitado sea permitido.
2. Si el usuario es paciente, genera `pseudoId`.
3. Si no es paciente, exige `professionalId`.
4. Verifica que el email no exista previamente.
5. Hashea la contrasena.
6. Resuelve el catalogo de rol y estado `ACTIVE`.
7. Construye el payload de persistencia.
8. Crea el usuario en la base de identidad.

#### `loginUser(credentials)`

1. Busca el usuario por email.
2. Compara la contrasena enviada con el hash almacenado.
3. Verifica que el usuario este `ACTIVE`.
4. Sanitiza el objeto de usuario.
5. Construye el payload del JWT.
6. Devuelve usuario autenticado y datos para generar el token.

#### `getProfessionalPublicKeyById(id)`

1. Valida que el `id` tenga formato UUID.
2. Busca el usuario por identificador interno.
3. Verifica que no sea paciente.
4. Devuelve la llave publica en formato de respuesta segura.

#### `getPatientPublicKeyByPseudoId(pseudoId)`

1. Valida que el `pseudoId` tenga formato UUID.
2. Busca el usuario por pseudoidentificador.
3. Verifica que si sea paciente.
4. Devuelve la llave publica del paciente.

---

## Ejecucion Local

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
- `FABRIC_CHANNEL`
- `FABRIC_CHAINCODE`
- `FABRIC_MSP_ID`
- `FABRIC_PEER_ENDPOINT`
- `FABRIC_PEER_HOST_ALIAS`
- `FABRIC_CRYPTO_BASE`
- `FABRIC_USER_MSP_PATH`
- `FABRIC_TLS_CERT_PATH`

---

## Resumen Arquitectonico

DiabetesChain (Backend) implementa una separacion clara entre identidad, permisos, auditoria e historia clinica. La informacion sensible se conserva cifrada fuera de la cadena, mientras que Hyperledger Fabric centraliza permisos, indices y trazabilidad. El backend actua como capa de orquestacion entre clientes, repositorios clinicos y componentes criptograficos, manteniendo el control del acceso centrado en el paciente.
