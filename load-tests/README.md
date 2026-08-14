# DiabetesChain load tests con k6

Este modulo prepara pruebas de carga tecnicas contra el backend de
DiabetesChain. Las pruebas no pasan por el frontend; el flujo medido es:

```text
k6 -> Backend/API -> MongoDB / SQLite / Hyperledger Fabric / PRE services
```

## Que se mide

- Latencia de escritura: `POST /clinical-records/events/doctor`.
- Latencia de lectura delegada: `GET /clinical-records/history/:patientUsername`.
- Tasa de error por escenario: metricas nativas de k6 y rates personalizados.
- Throughput aproximado: iteraciones por segundo y solicitudes por segundo en el resumen k6.
- Confirmacion Fabric: CSV escrito por el backend alrededor de `submitTransaction`.

La escritura elegida registra una consulta medica porque representa el flujo
principal: valida identidad, firma, permiso activo, scope, MongoDB off-chain y
registro on-chain con auditoria. La lectura elegida valida permiso de lectura,
registra auditoria en Fabric, consulta indices on-chain, recupera documentos
off-chain y solicita transformacion PRE.

## Requisitos previos

- Backend levantado, por defecto en `http://localhost:3000`.
- MongoDB disponible segun `MONGODB_URI`.
- SQLite de identidad e infraestructura inicializados por el backend.
- Hyperledger Fabric disponible con las variables `FABRIC_*` configuradas.
- Servicios PRE activos para los nodos configurados, por ejemplo `4100` y `4101`.
- `k6` instalado y disponible en PATH.
- Node.js disponible para `scripts/setup-test-data.js`.

El backend escribe metricas Fabric en:

```text
load-tests/results/fabric_metrics.csv
```

Se puede cambiar con `FABRIC_METRICS_PATH`. Se puede desactivar con
`FABRIC_METRICS_ENABLED=false`.

## Datos sinteticos

El script auxiliar puede registrar actores sinteticos y generar una firma valida
para el payload fijo de escritura:

```bash
cd diabeteschain-be/load-tests
npm run setup
```

El resultado queda en:

```text
results/setup-output.json
results/load-test.env
```

Los scripts k6 leen automaticamente `results/load-test.env` como fallback. Si
prefieres otra ruta, usa `LOAD_TEST_ENV_FILE`.

Si `patient_001` o `doctor_001` ya existen en la base local con otra
contrasena/llave publica, el setup crea automaticamente actores aislados con
sufijo, por ejemplo `doctor_001_lt_ab12cd`, y deja ese usuario en
`results/load-test.env`.

Actores propuestos:

| Tipo | Usuarios |
|---|---|
| Pacientes | `patient_001`, `patient_002`, `patient_003` |
| Medicos | `doctor_001`, `doctor_002`, `doctor_003` |
| Laboratorio | `lab_001`, `lab_002` |
| Farmacia | `pharma_001`, `pharma_002` |

Importante: el setup registra identidades y firma el evento de doctor, pero no
fabrica material Recrypt real. Antes de correr lectura y escritura con exito
debe existir un permiso activo `read` y `write` del paciente al profesional,
ScopeMaterial activo para el scope probado y transform keys registradas en PRE.
Ese grant puede hacerse desde el flujo normal del frontend o usando el template
en `results/setup-output.json` reemplazando los placeholders por material real.

Para una corrida tecnica temporal de escritura, mientras se prepara el grant
real, el backend permite activar:

```powershell
$env:LOAD_TEST_BYPASS_CLINICAL_ACCESS="true"
```

Esta bandera no omite JWT ni firma del doctor; solo evita fallar por permiso y
ScopeMaterial/PRE inexistentes. Debe usarse solo en ambiente local para validar
la medicion tecnica MongoDB + Fabric, y desactivarse cuando se evalua el flujo
completo de soberania/permisos.

Para lecturas de historiales con varios registros en Fabric local, puede ser
necesario aumentar el timeout de `evaluateTransaction` antes de levantar el
backend:

```powershell
$env:FABRIC_EVALUATE_TIMEOUT_MS="30000"
```

En PowerShell tambien se pueden cargar las variables generadas manualmente, si
se desea sobreescribir el fallback automatico:

```powershell
Get-Content .\results\load-test.env | ForEach-Object {
  if ($_ -match '^([^=]+)=(.*)$') {
    Set-Item -Path "env:$($matches[1])" -Value $matches[2]
  }
}
```

## Smoke test

Valida disponibilidad basica del backend, login opcional y `/scopes`:

```bash
k6 run -e BASE_URL=http://localhost:3000 scripts/smoke.js
```

Para incluir lectura o escritura en el smoke:

```bash
k6 run -e BASE_URL=http://localhost:3000 -e SMOKE_READ=true scripts/smoke.js
k6 run -e BASE_URL=http://localhost:3000 -e SMOKE_WRITE=true scripts/smoke.js
```

## Escenarios

| Escenario | Operaciones | VUs sugeridos |
|---|---:|---:|
| E1 | 50 | 5 |
| E2 | 100 | 10 |
| E3 | 500 | 20 |
| E4 | 1000 | 30 |
| E5 | 2000 | 50 |

Los valores se pueden ajustar con `TOTAL_RECORDS`, `TOTAL_READS`,
`TOTAL_OPERATIONS` y `VUS`.

## Escritura

Comando base:

```bash
k6 run \
  -e BASE_URL=http://localhost:3000 \
  -e AUTH_TOKEN=$AUTH_TOKEN \
  -e SCENARIO=E3 \
  -e TOTAL_RECORDS=500 \
  -e VUS=20 \
  --summary-export results/write_E3_500.json \
  scripts/write-load.js
```

Tambien se puede usar login dinamico:

```bash
k6 run \
  -e DOCTOR_EMAIL=doctor_001@load.diabeteschain.local \
  -e DOCTOR_PASSWORD=DiabetesChainLoad2026! \
  -e PATIENT_USERNAME=patient_001 \
  -e DOCTOR_EVENT_SIGNATURE=$DOCTOR_EVENT_SIGNATURE \
  --summary-export results/write_E1_50.json \
  scripts/write-load.js
```

## Lectura

Comando base:

```bash
k6 run \
  -e BASE_URL=http://localhost:3000 \
  -e AUTH_TOKEN=$AUTH_TOKEN \
  -e SCENARIO=E3 \
  -e TOTAL_READS=500 \
  -e VUS=20 \
  -e PATIENT_USERNAME=patient_001 \
  -e READ_SCOPE_IDS=8f4b8d0e-2d34-4cb3-b94d-7e4c8d1a31f2 \
  --summary-export results/read_E3_500.json \
  scripts/read-load.js
```

## Mixto opcional

Combina 70% lecturas y 30% escrituras por defecto:

```bash
k6 run \
  -e SCENARIO=E3 \
  -e TOTAL_OPERATIONS=500 \
  -e VUS=20 \
  -e WRITE_RATIO=0.3 \
  --summary-export results/mixed_E3_500.json \
  scripts/mixed-load.js
```

## Scripts npm

Desde `load-tests/`:

```bash
npm run smoke
npm run write:e1
npm run write:e2
npm run write:e3
npm run write:e4
npm run write:e5
npm run read:e1
npm run read:e2
npm run read:e3
npm run read:e4
npm run read:e5
```

## Resultados

- JSON k6: archivos pasados a `--summary-export`, por ejemplo
  `results/write_E3_500.json`.
- CSV Fabric: `results/fabric_metrics.csv`.
- Logs backend: consola del proceso `npm run dev` o `npm start`.

Metricas k6 relevantes:

- `http_req_duration`: latencia HTTP total vista por k6.
- `http_req_failed`: tasa nativa de fallos HTTP.
- `write_latency_ms` y `read_latency_ms`: trends personalizados.
- `write_error_rate` y `read_error_rate`: rates personalizados.
- `iterations` e `http_reqs`: base para throughput aproximado.

Columnas del CSV Fabric:

```csv
timestamp,scenario,operation,txId,recordId,patientId,actorId,totalBackendLatencyMs,fabricConfirmationMs,status,errorMessage
```

`fabricConfirmationMs` mide el tiempo alrededor de la llamada real a
`contract.submitTransaction(...)`. Si el chaincode no devuelve `txId`, la columna
queda vacia y la medicion sigue siendo util por operacion y escenario.

## Limitaciones

- Pruebas en ambiente local/controlado, no equivalen a produccion nacional.
- Los datos deben ser sinteticos.
- No se mide renderizado frontend.
- No se evalua hardening, seguridad ofensiva ni resistencia ante ataques.
- Las firmas y el material PRE deben corresponder al flujo criptografico real.
- Si Fabric, MongoDB o PRE no estan levantados, los escenarios fallaran y eso se
  reflejara en la tasa de error.
